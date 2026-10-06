import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Command } from '../Command.js';
import { Option } from '../index.js';
import { bumpSubmodule } from '../submodule/bumpSubmodule.js';
import { renderBumpSummary } from '../submodule/renderBumpSummary.js';

/**
 * The exact stdout of `submodule bump` when the gitlink already points at the source commit. A
 * workflow tells "nothing to bump" from "bumped" by this line, so it must never change.
 */
export const BUMP_UNCHANGED_OUTPUT = 'unchanged';

/**
 * Moves the product's submodule to a source ref and stages the new gitlink — the start of a bump PR.
 *
 * Under per-consumer refs a product no longer follows nzyme's `main` blindly: it proposes a newer
 * nzyme commit in a PR, and only its own CI going green lets that commit in (and, once on the
 * product's `main`, into `<consumer>/main` via `submodule mirror`). This prepares that PR's change
 * and its description; committing, pushing and merging stay with the product's workflow, which owns
 * the policy (cadence, source ref, auto-merge). See `docs/consumers.md`.
 */
export class SubmoduleBumpCommand extends Command {
    static override paths = [['submodule', 'bump']];

    static override usage = Command.Usage({
        category: 'Submodules',
        description: 'Move the submodule to a source ref and stage it, printing a markdown summary',
        details: `
            Run in the product repository. Fetches \`--source\` in the submodule (a branch — \`main\`
            or \`origin/main\` — a tag or a commit SHA), checks the submodule out at it (detached)
            and \`git add\`s the submodule path. Commits and pushes nothing.

            When the submodule moved, prints a markdown summary (old → new, a compare link for a
            GitHub remote, the new commits) and writes it to \`--summary-file\` if given.

            When the gitlink already points at the source commit, nothing is staged, no summary file
            is written, and stdout is exactly the single line \`${BUMP_UNCHANGED_OUTPUT}\`. Both cases
            exit 0; any other exit code is an error.
        `,
        examples: [
            ['Bump to the tip of main', 'nzyme submodule bump --source origin/main'],
            ['Bump to a release tag', 'nzyme submodule bump --source v0.15.0 --summary-file bump.md'],
        ],
    });

    source = Option.String('--source', {
        required: true,
        description: 'Branch, tag or commit to move the submodule to, e.g. origin/main',
    });

    submodulePath = Option.String('--path', 'nzyme', {
        description: 'Path of the submodule in the product repository',
    });

    remote = Option.String('--remote', 'origin', { description: "The submodule's remote to fetch from" });

    summaryFile = Option.String('--summary-file', { description: 'Also write the markdown summary to this file' });

    cwd = process.cwd();

    /**
     * Execute the command.
     */
    override async run() {
        const bump = await bumpSubmodule({
            repoDir: this.cwd,
            submodulePath: this.submodulePath,
            source: this.source,
            remote: this.remote,
        });

        if (!bump.changed) {
            this.context.stderr.write(`${bump.submodulePath} is already at ${bump.current} (${bump.source}).\n`);
            this.context.stdout.write(`${BUMP_UNCHANGED_OUTPUT}\n`);
            return 0;
        }

        const summary = renderBumpSummary(bump);
        if (this.summaryFile) {
            const summaryPath = path.resolve(this.cwd, this.summaryFile);
            await mkdir(path.dirname(summaryPath), { recursive: true });
            await writeFile(summaryPath, summary);
        }

        this.context.stdout.write(summary);
        return 0;
    }
}
