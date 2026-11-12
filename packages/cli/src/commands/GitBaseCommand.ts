import { Option } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import { resolveAffectedBase } from '@nzyme/project-utils/resolveAffectedBase.js';

import { readAffectedConfig } from '../affected/AffectedConfig.js';
import { GitRepository } from '../submodule/GitRepository.js';

/**
 * Prints the base `nzyme git affected` measures the change against, so a script that scopes other
 * checks to the change (a format, a typecheck) diffs against the very same base as the tests.
 *
 * stdout is a contract (one line, the ref), so the diagnostic goes to stderr.
 */
export class GitBaseCommand extends Command {
    static override paths = [['git', 'base']];

    static override usage = Command.Usage({
        category: 'Testing',
        description: 'Print the base ref `nzyme git affected` measures the change against',
        details: `
            Resolves the base exactly as \`nzyme git affected\` does — \`--base <ref>\`; in
            GitHub Actions the pull request base or the push \`before\`; otherwise the nearest of
            \`nzyme.affected.baseBranches\` (as \`origin/<name>\`) — and prints its ref on stdout,
            one line. Passed back as \`--base\`, that ref resolves the same base. The source and
            the merge-base go to stderr. Fails when the base cannot be resolved.
        `,
        examples: [
            ['Print the base', 'nzyme git base'],
            ['Check an explicit base exists and print it', 'nzyme git base --base origin/release'],
        ],
    });

    base = Option.String('--base,-b', { description: 'An explicit base ref; wins over everything else' });

    cwd = process.cwd();

    /**
     * Execute the command.
     */
    override async run() {
        const root = await new GitRepository(this.cwd).git(['rev-parse', '--show-toplevel']);
        const config = await readAffectedConfig(root);
        const base = await resolveAffectedBase({
            root,
            base: this.base,
            env: process.env,
            baseBranches: config.baseBranches,
        });

        this.context.stderr.write(
            `nzyme git base: ${base.ref} (${base.source}, merge-base ${base.mergeBase.slice(0, 10)})\n`,
        );
        this.context.stdout.write(`${base.ref}\n`);
        return 0;
    }
}
