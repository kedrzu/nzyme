import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { StateStore } from '../state/StateStore.js';

export interface ResolveWorkspaceOptions {
    /** Any directory inside the repo: the main checkout or one of its worktrees. */
    cwd: string;
    /** The documents folder, relative to the main checkout. */
    folder: string;
    /** The recovered folder, relative to the main checkout. */
    recovered: string;
}

/** Where one clone keeps its synced documents and its sync state. */
export interface Workspace {
    /** The repo's main checkout; its folders are shared by every worktree of the clone. */
    mainDir: string;
    /** The work tree `cwd` is in; messages name files relative to it. */
    workTree: string;
    documentsDir: string;
    recoveredDir: string;
    /** In `<git-common-dir>/outline-sync/`, created here. */
    store: StateStore;
}

/**
 * Finds the clone `cwd` belongs to. The documents live in its main checkout and the state in its common git
 * directory, so several worktrees share one sync. `null` outside a git repo, or for a bare one.
 */
export async function resolveWorkspace(options: ResolveWorkspaceOptions): Promise<Workspace | null> {
    const revParse = await git(options.cwd, [
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir',
        '--show-toplevel',
    ]);
    const worktrees = await git(options.cwd, ['worktree', 'list', '--porcelain']);
    if (revParse == null || worktrees == null) {
        return null;
    }
    const [commonDir, workTree] = revParse.split('\n');
    // The first entry is always the main worktree; a bare repo has none.
    const [first = '', second = ''] = worktrees.split('\n');
    if (!commonDir || !workTree || !first.startsWith('worktree ') || second === 'bare') {
        return null;
    }
    const mainDir = first.slice('worktree '.length);
    const stateDir = join(commonDir, 'outline-sync');
    await mkdir(stateDir, { recursive: true });
    return {
        mainDir,
        workTree,
        documentsDir: join(mainDir, options.folder),
        recoveredDir: join(mainDir, options.recovered),
        store: new StateStore(stateDir),
    };
}

async function git(cwd: string, args: string[]): Promise<string | null> {
    const child = Bun.spawn(['git', '-C', cwd, ...args], { stdout: 'pipe', stderr: 'ignore' });
    const [output, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    return exitCode === 0 ? output.trim() : null;
}
