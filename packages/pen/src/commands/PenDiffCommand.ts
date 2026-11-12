import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { Option } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import { sumOver } from '@nzyme/utils/array/sumOver.js';

import type { PenChangedNode, PenDiff, PenDiffNode, PenMovedNode, PenNodePlace, PenSubtreeNode } from '../diffPen.js';
import { diffPen } from '../diffPen.js';
import { formatPenValue } from '../formatPenValue.js';
import type { PenFrameRef } from '../PenDocument.js';
import { parsePen } from '../PenDocument.js';

/** Enough for a design file of hundreds of megabytes; `execFile` fails on more output than this. */
const MAX_BUFFER = 1024 * 1024 * 1024;

/**
 * `pen diff`: what changed in a `.pen` file between two revisions, node by node, as Markdown a
 * reader (or an agent) can follow screen by screen.
 */
export class PenDiffCommand extends Command {
    static override paths = [['pen', 'diff']];

    static override usage = Command.Usage({
        category: 'Pen',
        description: 'Show what changed in a .pen design file, node by node',
        details: `
            Takes revisions as \`git diff\` does: none compares the working file with \`HEAD\`, one
            compares it with that revision, two compare the revisions. The path follows \`--\`; it may
            be left out when git tracks exactly one \`.pen\` file. Prints Markdown: a summary, then per
            top-level frame the added, removed, changed (with the changed properties) and moved nodes,
            then the changed variables and the changed components with their instance counts.
        `,
        examples: [
            ['Uncommitted changes', 'nzyme pen diff'],
            ['Changes on this branch', 'nzyme pen diff main -- design.pen'],
            ['Changes between two commits', 'nzyme pen diff HEAD~3 HEAD'],
        ],
    });

    /** Taken raw, because clipanion drops the `--` that separates the revisions from the path. */
    args = Option.Proxy({ name: '[<rev>] [<rev>] [-- <path>]' });

    override async run() {
        const separator = this.args.indexOf('--');
        const revs = separator === -1 ? this.args : this.args.slice(0, separator);
        const paths = separator === -1 ? [] : this.args.slice(separator + 1);
        if (revs.length > 2 || paths.length > 1) {
            this.context.stderr.write('pen diff: usage: nzyme pen diff [<rev>] [<rev>] [-- <path>]\n');
            return 1;
        }

        const file = paths[0] ?? (await findOnlyPenFile());
        if (file === null) {
            this.context.stderr.write(
                'pen diff: git tracks no single .pen file here; name it: nzyme pen diff [<rev>] [<rev>] -- <path>\n',
            );
            return 1;
        }

        const [fromRev = 'HEAD', toRev] = revs;
        let diff: PenDiff;
        try {
            const [beforeText, afterText] = await Promise.all([
                showRevision(fromRev, file),
                toRev === undefined ? readFile(file, 'utf8') : showRevision(toRev, file),
            ]);
            diff = diffPen(parsePen(beforeText), parsePen(afterText));
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.context.stderr.write(`pen diff: cannot read ${file}: ${reason}\n`);
            return 1;
        }

        const title = `\`${file}\`: ${fromRev} → ${toRev ?? 'working tree'}`;
        this.context.stdout.write(formatDiff(title, diff));
        return 0;
    }
}

async function findOnlyPenFile(): Promise<string | null> {
    const { stdout } = await promisify(execFile)('git', ['ls-files', '-z', '--', '*.pen'], { maxBuffer: MAX_BUFFER });
    const files = stdout.split('\0').filter(file => file !== '');
    return files.length === 1 ? (files[0] ?? null) : null;
}

/** The file as `rev` has it; `./` makes git read the path from the current directory, as the working file is. */
async function showRevision(rev: string, file: string): Promise<string> {
    const relative = path.relative(process.cwd(), path.resolve(file));
    const { stdout } = await promisify(execFile)('git', ['show', `${rev}:./${relative}`], { maxBuffer: MAX_BUFFER });
    return stdout;
}

function formatDiff(title: string, diff: PenDiff): string {
    const lines = [`# ${title}`, '', formatSummary(diff), ''];

    for (const frame of diff.frames) {
        lines.push(`## ${formatFrame(frame.frame)}`, '');
        lines.push(...frame.added.map(node => `- added ${formatSubtree(node)}`));
        lines.push(...frame.removed.map(node => `- removed ${formatSubtree(node)}`));
        lines.push(...frame.changed.map(formatChanged));
        lines.push(...frame.moved.map(formatMoved));
        lines.push('');
    }

    if (diff.variables.length > 0) {
        lines.push('## Variables', '');
        for (const variable of diff.variables) {
            const values =
                variable.change === 'changed'
                    ? `${formatPenValue(variable.before)} → ${formatPenValue(variable.after)}`
                    : formatPenValue(variable.change === 'added' ? variable.after : variable.before);
            lines.push(`- ${variable.change} \`${variable.name}\`: ${values}`);
        }
        lines.push('');
    }

    if (diff.components.length > 0) {
        lines.push('## Components', '', 'A change to a component reaches every instance of it.', '');
        for (const component of diff.components) {
            lines.push(
                `- ${component.change} ${formatNode(component)} on ${formatFrame(component.frame)}: ${component.instances} instance(s)`,
            );
        }
        lines.push('');
    }

    if (diff.keys.length > 0) {
        lines.push('## Document', '', `- changed ${diff.keys.map(key => `\`${key}\``).join(', ')}`, '');
    }

    return lines.join('\n');
}

function formatSummary(diff: PenDiff): string {
    const counts = { added: 0, removed: 0, changed: 0, moved: 0 };
    for (const frame of diff.frames) {
        counts.added += sumOver(frame.added, subtree => 1 + subtree.descendants);
        counts.removed += sumOver(frame.removed, subtree => 1 + subtree.descendants);
        counts.changed += frame.changed.length;
        counts.moved += frame.moved.length;
    }

    if (diff.frames.length === 0 && diff.variables.length === 0 && diff.keys.length === 0) {
        return 'No changes.';
    }

    return (
        `${counts.added} added, ${counts.removed} removed, ${counts.changed} changed, ${counts.moved} moved node(s) ` +
        `in ${diff.frames.length} frame(s); ${diff.variables.length} variable(s) and ` +
        `${diff.components.length} component(s) changed.`
    );
}

function formatSubtree(node: PenSubtreeNode): string {
    return formatNode(node, node.descendants === 0 ? undefined : `+${node.descendants} inside`);
}

function formatChanged(node: PenChangedNode): string {
    return `- changed ${formatNode(node)}: ${node.keys.map(key => `\`${key}\``).join(', ')}`;
}

function formatMoved(node: PenMovedNode): string {
    if (node.from.parentId === node.to.parentId) {
        return `- moved ${formatNode(node)} within ${formatParent(node.to)}: position ${node.from.index} → ${node.to.index}`;
    }

    return `- moved ${formatNode(node)} from ${formatParent(node.from)} to ${formatParent(node.to)} at position ${node.to.index}`;
}

function formatParent(place: PenNodePlace): string {
    return place.parentId === null ? 'the top level' : `\`${place.parentId}\``;
}

function formatNode(node: PenDiffNode, note?: string): string {
    const name = node.name === null ? '' : ` "${node.name}"`;
    return `\`${node.id}\`${name} (${node.type}${note === undefined ? '' : `, ${note}`})`;
}

function formatFrame(frame: PenFrameRef): string {
    return frame.name === null ? `\`${frame.id}\`` : `"${frame.name}" (\`${frame.id}\`)`;
}
