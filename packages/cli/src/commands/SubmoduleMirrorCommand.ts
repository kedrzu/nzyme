import { assertNever } from '@nzyme/utils/assertNever.js';

import { Command } from '../Command.js';
import { Option } from '../index.js';
import type { MirrorAction, MirrorResult } from '../submodule/mirrorSubmoduleRef.js';
import { isMirrorRefusal, mirrorSubmoduleRef } from '../submodule/mirrorSubmoduleRef.js';

/**
 * Advances a per-consumer ref in the submodule's repository (e.g. nzyme's `healed/main`) to the
 * commit the product's `HEAD` pins.
 *
 * Products consume nzyme as a git submodule. A gitlink is an exact pin, but the product only knows
 * that pin is good once its own CI passed on it — so after a green run on the product's `main` or
 * `release`, this records the pinned commit as `<consumer>/<branch>` in nzyme. nzyme then knows,
 * per product, which of its commits is in that product's main line and in its production, and
 * hotfixes can branch from exactly that. The ref moves fast-forward only; anything else is refused
 * and reported, never forced. See `docs/consumers.md`.
 */
export class SubmoduleMirrorCommand extends Command {
    static override paths = [['submodule', 'mirror']];

    static override usage = Command.Usage({
        category: 'Submodules',
        description: "Fast-forward the submodule's <consumer>/<branch> ref to the commit HEAD pins",
        details: `
            Run in the product repository after its CI passed. Reads the gitlink of \`--path\` at
            HEAD and moves \`refs/heads/<consumer>/<branch>\` on the submodule's remote to it:
            creates the ref when missing, does nothing when it already matches, pushes when the ref
            is an ancestor of the gitlink (a fast-forward). A rollback or a divergence is refused:
            the ref is left untouched, both commits are printed and the exit code is 1. Never
            force-pushes. A shallow submodule clone is unshallowed first, for the ancestry check.
        `,
        examples: [
            ['Mirror the product main', 'nzyme submodule mirror --consumer healed --branch main'],
            ['Preview only', 'nzyme submodule mirror --consumer healed --branch release --dry-run'],
        ],
    });

    consumer = Option.String('--consumer', { required: true, description: 'Consumer name, e.g. healed' });

    branch = Option.String('--branch', {
        required: true,
        description: "The product branch whose pin is mirrored, e.g. main — the ref is '<consumer>/<branch>'",
    });

    submodulePath = Option.String('--path', 'nzyme', {
        description: 'Path of the submodule in the product repository',
    });

    remote = Option.String('--remote', 'origin', { description: "The submodule's remote to push the ref to" });

    dryRun = Option.Boolean('--dry-run', false, { description: 'Report what would happen; push nothing' });

    cwd = process.cwd();

    /**
     * Execute the command.
     */
    override async run() {
        const targetBranch = `${this.consumer}/${this.branch}`;
        const result = await mirrorSubmoduleRef({
            repoDir: this.cwd,
            submodulePath: this.submodulePath,
            targetBranch,
            remote: this.remote,
            dryRun: this.dryRun,
        });

        if (isMirrorRefusal(result.action)) {
            this.context.stderr.write(describeRefusal(targetBranch, result));
            return 1;
        }

        this.context.stdout.write(`${describeMirror(targetBranch, result)}\n`);
        return 0;
    }
}

/** One line on what happened (or, in a dry run, would happen) to the ref. */
function describeMirror(targetBranch: string, result: MirrorResult): string {
    const { action, gitlink, previous, pushed } = result;
    switch (action) {
        case 'create':
            return `${targetBranch}: ${pushed ? 'created' : 'would create'} at ${gitlink}`;
        case 'fast-forward':
            return `${targetBranch}: ${pushed ? 'fast-forwarded' : 'would fast-forward'} ${previous} → ${gitlink}`;
        case 'noop':
            return `${targetBranch}: already at ${gitlink}, nothing to do`;
        case 'rollback':
        case 'diverged':
            throw new Error(`Refusal "${action}" must be reported by describeRefusal, not describeMirror`);
        default:
            return assertNever(action, 'Unhandled mirror action');
    }
}

/** Why the ref was not moved, both commits, and how to resolve it. */
function describeRefusal(targetBranch: string, result: MirrorResult): string {
    const { action, gitlink, previous } = result;
    const reason = describeRefusalReason(action);

    return [
        `✗ ${targetBranch} was left untouched: moving it would not be a fast-forward.`,
        `  ${targetBranch} is at ${previous ?? '(missing)'}`,
        `  the product pins   ${gitlink}`,
        `  Reason: ${reason}.`,
        '  Resolve by hand: bump the product to a commit that contains the ref (e.g. merge it in),',
        '  or — only if the ref itself must go back — move it deliberately with',
        `  \`git push --force-with-lease=refs/heads/${targetBranch}:${previous ?? ''} <remote> ${gitlink}:refs/heads/${targetBranch}\`.`,
        '',
    ].join('\n');
}

/** Why the ref was refused; only a refusal action has one. */
function describeRefusalReason(action: MirrorAction): string {
    switch (action) {
        case 'rollback':
            return 'the pinned commit is an ancestor of the ref — the product went back (rollback)';
        case 'diverged':
            return 'neither commit descends from the other — the histories diverged';
        case 'create':
        case 'noop':
        case 'fast-forward':
            throw new Error(`Action "${action}" is not a refusal`);
        default:
            return assertNever(action, 'Unhandled mirror action');
    }
}
