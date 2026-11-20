import type { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';

import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { login } from '../auth/oauth.js';
import { LoginRequiredError, createTokenProvider, outlineTokenStore } from '../auth/tokens.js';
import { HOOK_EVENTS, runHook } from '../hook/hook.js';
import type { HookEvent } from '../hook/hook.js';
import { renderReport } from '../hook/messages.js';
import { OutlineClient } from '../outline/OutlineClient.js';
import { pull } from '../reconcile/pull.js';
import { acquireLock } from '../state/lock.js';
import type { LockHandle } from '../state/lock.js';
import { resolveWorkspace } from '../sync/resolveWorkspace.js';
import type { Workspace } from '../sync/resolveWorkspace.js';
import { syncOnce } from '../sync/syncOnce.js';
import type { SyncRun } from '../sync/syncOnce.js';
import type { OutlineCommandsOptions } from './OutlineCommandsOptions.js';

/** How long `pull` and `sync` wait for a hook of another session to finish its run. */
const LOCK_WAIT_MS = 60 * 1000;
/** `pull` reports progress after each batch this long. */
const PULL_BATCH_MS = 15 * 1000;

/**
 * Defines the Outline sync commands for a product CLI, which spreads them into `execute({ commands })`:
 * `login` (OAuth in the browser), `pull` (a full pull, finishing the first download however long it takes),
 * `sync` (pull, push and sharing) and `hook <session-start|prompt|stop|session-end>` for Claude Code hooks.
 * The documents live in the repo's main checkout and the state in its common git directory, so every worktree
 * of a clone shares one sync.
 * @__NO_SIDE_EFFECTS__
 */
export function defineOutlineCommands(options: OutlineCommandsOptions): CommandClass[] {
    const prefix = options.prefix ?? 'outline';
    const folder = options.folder ?? 'documents';
    const recovered = options.recovered ?? 'recovered';
    const commandHint = options.commandHint ?? prefix;
    const { url, clientId } = options;

    class OutlineLoginCommand extends Command {
        static override paths = [[prefix, 'login']];
        static override usage = Command.Usage({
            category: 'Outline',
            description: 'Log in to Outline in the browser',
            details: 'Opens the Outline authorization page; the login is kept in the system keychain.',
        });

        override async run() {
            const workspace = await openWorkspace();
            const info = await login({
                url,
                clientId,
                store: outlineTokenStore({ url }),
                lockPath: workspace.store.lockPath,
            });
            this.context.stdout.write(`Logged in to Outline as ${info.user.name}.\n`);
        }
    }

    class OutlinePullCommand extends Command {
        static override paths = [[prefix, 'pull']];
        static override usage = Command.Usage({
            category: 'Outline',
            description: 'Download every Outline document into the documents folder',
            details: 'A full pass; it finishes an interrupted first download however long it takes.',
        });

        override async run() {
            const workspace = await openWorkspace();
            const client = heldClient();
            await withLock(workspace, async () => {
                let written = 0;
                for (;;) {
                    const report = await pull({
                        client,
                        store: workspace.store,
                        state: await workspace.store.load(),
                        documentsDir: workspace.documentsDir,
                        recoveredDir: workspace.recoveredDir,
                        mode: 'full',
                        deadline: Date.now() + PULL_BATCH_MS,
                    });
                    written += report.written.length;
                    if (!report.stoppedAtDeadline) {
                        this.context.stdout.write(`Pull finished: ${written} files written.\n`);
                        return;
                    }
                    this.context.stdout.write(`${written} files written so far, continuing…\n`);
                }
            });
        }
    }

    class OutlineSyncCommand extends Command {
        static override paths = [[prefix, 'sync']];
        static override usage = Command.Usage({
            category: 'Outline',
            description: 'Pull from Outline, push local changes and sync sharing',
        });

        override async run() {
            const workspace = await openWorkspace();
            const client = heldClient();
            const run: SyncRun = {};
            await withLock(workspace, () =>
                syncOnce({
                    client,
                    workspace,
                    mode: 'full',
                    deadlines: {
                        pull: Number.POSITIVE_INFINITY,
                        push: Number.POSITIVE_INFINITY,
                        sharing: Number.POSITIVE_INFINITY,
                    },
                    privateCollection: options.privateCollection,
                    run,
                }),
            );
            const report = renderReport({
                run,
                state: await workspace.store.load(),
                documents: `${folder}/`,
                recovered: `${recovered}/`,
                recoveredFiles: [],
                commandHint,
                userLanguage: options.userLanguage,
            });
            this.context.stdout.write(`${report || 'Outline sync: everything is up to date.'}\n`);
        }
    }

    class OutlineHookCommand extends Command {
        static override paths = [[prefix, 'hook']];
        static override usage = Command.Usage({
            category: 'Outline',
            description: 'Run the sync for a Claude Code hook event',
            details: `
                Reads the hook's JSON from stdin and prints the hook's output. Always exits 0: a sync
                problem never breaks the session.
            `,
            examples: [['At session start', `${prefix} hook session-start`]],
        });

        event = Option.String({ required: true });

        override async run() {
            try {
                if (!isHookEvent(this.event)) {
                    return 0;
                }
                const output = await runHook({
                    event: this.event,
                    input: await readStdin(this.context.stdin),
                    projectDir: process.env.CLAUDE_PROJECT_DIR || undefined,
                    cwd: process.cwd(),
                    url,
                    clientId,
                    folder,
                    recovered,
                    privateCollection: options.privateCollection,
                    commandHint,
                    userLanguage: options.userLanguage,
                    tokenStore: outlineTokenStore({ url }),
                });
                if (output !== '') {
                    this.context.stdout.write(`${output}\n`);
                }
            } catch {
                // `runHook` never throws; this covers reading stdin and building the token store.
            }
            return 0;
        }
    }

    return [OutlineLoginCommand, OutlinePullCommand, OutlineSyncCommand, OutlineHookCommand];

    async function openWorkspace(): Promise<Workspace> {
        const workspace = await resolveWorkspace({ cwd: process.cwd(), folder, recovered });
        if (workspace == null) {
            throw new UsageError('Run this inside the git repository that holds the Outline documents.');
        }
        return workspace;
    }

    /** For a command holding the sync lock while it talks to Outline. */
    function heldClient(): OutlineClient {
        return new OutlineClient({
            url,
            getAccessToken: createTokenProvider({
                url,
                clientId,
                store: outlineTokenStore({ url }),
                lock: { kind: 'held' },
            }),
        });
    }

    async function withLock(workspace: Workspace, work: () => Promise<void>): Promise<void> {
        const lock: LockHandle | null = await acquireLock(workspace.store.lockPath, { timeoutMs: LOCK_WAIT_MS });
        if (lock == null) {
            throw new UsageError('Another Outline sync is still running; try again in a minute.');
        }
        try {
            await work();
        } catch (error) {
            if (error instanceof LoginRequiredError) {
                throw new UsageError(`${error.message}. Run \`${commandHint} login\` first.`);
            }
            throw error;
        } finally {
            await lock.release();
        }
    }
}

function isHookEvent(value: string): value is HookEvent {
    return HOOK_EVENTS.some(event => event === value);
}

/** A terminal gives no hook input; waiting for one would hang. */
async function readStdin(stdin: Readable): Promise<string> {
    return 'isTTY' in stdin && stdin.isTTY === true ? '' : await text(stdin);
}
