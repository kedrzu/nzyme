import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import chalk from 'chalk';
import type { SimpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import type { BranchGuard } from './createBranchGuard.js';
import { pushWithUpstream } from './pushWithUpstream.js';

/**
 * Runs one command in `cwd` and resolves once it exits successfully; rejects otherwise.
 */
export type CommandRunner = (command: readonly string[], cwd: string) => Promise<void>;

/**
 * Rewrites `bun.lock` from the workspaces' `package.json` files without installing anything or
 * running a lifecycle script — the regenerate is a commit's worth of bookkeeping, not a setup.
 */
const REGENERATE_COMMAND = ['bun', 'install', '--lockfile-only'] as const;

const LOCKFILE = 'bun.lock';

/**
 * Parameters for {@link refreshLockfile}.
 */
export interface RefreshLockfileParams {
    /**
     * Git instance of the main repository.
     */
    git: SimpleGit;

    /**
     * The trunk the submodules follow. HEAD's gitlinks are compared with those of the main
     * repository's `origin/<trunk>`: a branch that carries a submodule bump gets its lock regenerated
     * on every sync, so a regenerate that failed or never ran is made up by the next one.
     */
    trunk: string;

    /**
     * The gitlinks HEAD recorded when the sync started — see {@link readGitlinks}. Compared with
     * instead when the main repository has no `origin/<trunk>`.
     */
    gitlinksAtStart: string;

    /**
     * Paths of the submodules whose gitlinks are compared.
     */
    submodulePaths: string[];

    /**
     * The main repository's branch guard: the regenerate writes to the working tree, and the commit
     * and push to the branch.
     */
    guard: BranchGuard;

    /**
     * Runs the regenerate command.
     */
    runCommand: CommandRunner;

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Read the gitlinks a commit records for `submodulePaths`, as one comparable string.
 * @returns `git ls-tree` output for exactly those paths.
 */
export async function readGitlinks(git: SimpleGit, submodulePaths: string[], commit = 'HEAD'): Promise<string> {
    return await git.raw(['ls-tree', commit, '--', ...submodulePaths]);
}

/**
 * Regenerate, commit and push the main repository's `bun.lock` when HEAD's gitlinks differ from
 * the trunk's — the branch carries a submodule bump.
 *
 * A product whose workspaces include a submodule's packages records their versions and dependencies
 * in `bun.lock`, and its CI installs with `--frozen-lockfile` — a moved gitlink without the lock that
 * matches it fails CI setup. Only `bun.lock` is committed, whatever else the command touched.
 */
export async function refreshLockfile(params: RefreshLockfileParams): Promise<void> {
    const { git, trunk, gitlinksAtStart, submodulePaths, guard, runCommand, logger } = params;

    const trunkRef = `origin/${trunk}`;
    // A missing ref exits non-zero with nothing on stderr, which simple-git may resolve or reject.
    const trunkCommit = await git.raw(['rev-parse', '--verify', '--quiet', `${trunkRef}^{commit}`]).catch(() => '');
    const hasTrunkRef = trunkCommit.trim() !== '';
    const baseline = hasTrunkRef ? await readGitlinks(git, submodulePaths, trunkRef) : gitlinksAtStart;
    if ((await readGitlinks(git, submodulePaths)) === baseline) {
        return;
    }

    const root = (await git.revparse(['--show-toplevel'])).trim();
    if (!existsSync(join(root, LOCKFILE))) {
        return;
    }

    const command = REGENERATE_COMMAND.join(' ');
    logger.info(`   Regenerating ${LOCKFILE} for the submodule update (${chalk.cyan(command)})...`);

    await guard.beforeWrite();
    try {
        await runCommand(REGENERATE_COMMAND, root);
    } catch (error) {
        // Never skipped: a stale lock fails the product's CI install anyway, later and further away.
        throw new Error(`Regenerating ${LOCKFILE} failed: \`${command}\` in ${root}`, { cause: error });
    }

    if (!(await git.raw(['status', '--porcelain', '--', LOCKFILE])).trim()) {
        logger.info(`   ${LOCKFILE} already matches the submodule update`);
        return;
    }

    await guard.beforeWrite();
    await git.raw(['commit', '-m', `Refresh ${LOCKFILE} for the submodule update`, '--', LOCKFILE]);
    await guard.beforePush();
    await pushWithUpstream(git);
    logger.info(`   ${chalk.green('✓')} Pushed the refreshed ${LOCKFILE}`);
}

/**
 * The {@link CommandRunner} used outside tests: the command's own output is captured and carried in
 * the rejection rather than printed over the sync's log.
 */
export async function execCommand(command: readonly string[], cwd: string): Promise<void> {
    const [file, ...args] = command;
    if (file == null) {
        throw new Error('execCommand: empty command');
    }

    await promisify(execFile)(file, args, { cwd });
}
