import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { Option } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';

import { mergePen } from '../mergePen.js';
import type { PenDocument } from '../PenDocument.js';
import { parsePen, serializePen } from '../PenDocument.js';
import { writeConflictReport } from '../writeConflictReport.js';

/**
 * `pen merge`: git's merge driver for `.pen` files. It merges node by node and leaves a valid file
 * either way; on conflicts it keeps ours at each, writes a report and exits 1, so git stops the
 * merge with the path unmerged. Exits never above 128, which git would take for a driver failure.
 */
export class PenMergeCommand extends Command {
    static override paths = [['pen', 'merge']];

    static override usage = Command.Usage({
        category: 'Pen',
        description: 'Merge a .pen design file node by node (a git merge driver)',
        details: `
            Merges \`base\`, \`ours\` and \`theirs\` (git's \`%O %A %B\`) into \`ours\`: changes made on
            one side only merge on their own. Where both sides changed the same thing differently,
            ours is kept, the conflicts are written to \`<git dir>/pen-conflicts/<path>.md\` and the
            exit code is 1; a clean merge deletes that report. \`path\` (git's \`%P\`) names the file
            in the report. On an unreadable input, \`ours\` is left untouched and the exit code is 1.
        `,
        examples: [
            ['Register as the merge driver for *.pen', 'git config merge.pen.driver "bun nzyme pen merge %O %A %B %P"'],
        ],
    });

    base = Option.String({ name: 'base' });
    ours = Option.String({ name: 'ours' });
    theirs = Option.String({ name: 'theirs' });
    file = Option.String({ name: 'path', required: false });

    override async run() {
        const file = this.file ?? this.ours;

        let oursText: string;
        let docs: [PenDocument, PenDocument, PenDocument];
        try {
            const [baseText, readOurs, theirsText] = await Promise.all([
                readFile(this.base, 'utf8'),
                readFile(this.ours, 'utf8'),
                readFile(this.theirs, 'utf8'),
            ]);
            oursText = readOurs;
            docs = [parsePen(baseText), parsePen(oursText), parsePen(theirsText)];
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.context.stderr.write(`pen merge: cannot merge ${file}, ours left as it was: ${reason}\n`);
            return 1;
        }

        const { doc, conflicts } = mergePen(...docs);
        await writeFile(this.ours, serializePen(doc, oursText));

        const reportPath = await getReportPath(file);
        await writeConflictReport({ reportPath, file, conflicts });

        if (conflicts.length > 0) {
            this.context.stderr.write(
                `pen merge: ${conflicts.length} conflict(s) in ${file}, ours kept at each; report: ${reportPath}\n`,
            );
            return 1;
        }

        return 0;
    }
}

/** `<git dir>/pen-conflicts/<file with / as __>.md`: under the git dir, so it never enters a commit. */
async function getReportPath(file: string): Promise<string> {
    const { stdout } = await promisify(execFile)('git', ['rev-parse', '--git-path', 'pen-conflicts']);
    return path.resolve(stdout.trim(), `${file.replaceAll('/', '__')}.md`);
}
