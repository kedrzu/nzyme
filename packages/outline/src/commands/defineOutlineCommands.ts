import { readFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { text } from 'node:stream/consumers';

import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { login } from '../auth/oauth.js';
import { LoginRequiredError, createTokenProvider, outlineTokenStore } from '../auth/tokens.js';
import { parseDocFile } from '../doc/codec.js';
import { HOOK_EVENTS, runHook } from '../hook/hook.js';
import type { HookEvent } from '../hook/hook.js';
import { renderReport } from '../hook/messages.js';
import { OutlineApiError } from '../outline/errors.js';
import { OutlineClient } from '../outline/OutlineClient.js';
import { pull } from '../reconcile/pull.js';
import {
    collectionAccess,
    collectionsNamed,
    directShares,
    findCollection,
    findShareTarget,
    share,
    shareCollection,
    ShareTargetError,
    unshare,
    unshareCollection,
} from '../sharing/sharing.js';
import type { CollectionAccess, DirectShare, ShareTarget } from '../sharing/sharing.js';
import { acquireLock } from '../state/lock.js';
import type { LockHandle } from '../state/lock.js';
import { resolveWorkspace } from '../sync/resolveWorkspace.js';
import type { Workspace } from '../sync/resolveWorkspace.js';
import { findPrivateCollection, syncOnce } from '../sync/syncOnce.js';
import type { SyncRun } from '../sync/syncOnce.js';
import { isInside } from '../utils/isInside.js';
import { pathExists } from '../utils/pathExists.js';
import type { OutlineCommandsOptions } from './OutlineCommandsOptions.js';

/** How long the commands wait for a hook of another session to finish its run. */
const LOCK_WAIT_MS = 60 * 1000;
/** `pull` reports progress after each batch this long, counted from when the batch's listing of Outline returns. */
const PULL_BATCH_MS = 15 * 1000;

/**
 * Defines the Outline sync commands for a product CLI, which spreads them into `execute({ commands })`:
 * `login` (OAuth in the browser), `pull` (a full pull, finishing the first download however long it takes),
 * `sync` (pull and push), `share`, `unshare` and `shares` (a synced document's direct shares in Outline),
 * `collection create|share|unshare|shares` (create a collection, change and list who can reach it) and
 * `hook <session-start|prompt|stop|session-end>` for Claude Code hooks.
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
                store: outlineTokenStore({ url, keychain: options.keychain }),
                lockPath: workspace.store.lockPath,
                openBrowser: options.openBrowser,
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
                const written = await pullAll(client, workspace, this.context.stdout);
                this.context.stdout.write(`Pull finished: ${written} files written.\n`);
            });
        }
    }

    class OutlineSyncCommand extends Command {
        static override paths = [[prefix, 'sync']];
        static override usage = Command.Usage({
            category: 'Outline',
            description: 'Pull from Outline and push local changes',
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

    class OutlineShareCommand extends Command {
        static override paths = [[prefix, 'share']];
        static override usage = Command.Usage({
            category: 'Outline',
            description: 'Share a synced document with Outline users or groups (they can edit it)',
            details:
                "Each name is a user's full name or e-mail, or a group's name, as Outline has it. Prints the shares after.",
            examples: [
                ['Share with a person and a group', `${prefix} share documents/wiki/offer.md "Ania Kowalska" zespol`],
            ],
        });

        file = Option.String({ required: true });
        names = Option.Rest({ required: 1 });

        override async run() {
            await changeShares(this.context.stdout, this.file, this.names, share);
        }
    }

    class OutlineUnshareCommand extends Command {
        static override paths = [[prefix, 'unshare']];
        static override usage = Command.Usage({
            category: 'Outline',
            description: 'Remove direct shares of a synced document',
            details: 'Access through the collection or a parent document stays. Prints the shares after.',
            examples: [['Stop sharing with a person', `${prefix} unshare documents/wiki/offer.md ania@example.com`]],
        });

        file = Option.String({ required: true });
        names = Option.Rest({ required: 1 });

        override async run() {
            await changeShares(this.context.stdout, this.file, this.names, unshare);
        }
    }

    class OutlineSharesCommand extends Command {
        static override paths = [[prefix, 'shares']];
        static override usage = Command.Usage({
            category: 'Outline',
            description: 'List the users and groups a synced document is shared with directly',
        });

        file = Option.String({ required: true });

        override async run() {
            await withDocument(this.file, async (client, id) => {
                this.context.stdout.write(renderShares(await directShares(client, id)));
            });
        }
    }

    class OutlineCollectionCreateCommand extends Command {
        static override paths = [[prefix, 'collection', 'create']];
        static override usage = Command.Usage({
            category: 'Outline',
            description:
                'Create an Outline collection only its members can reach, and pull it into the documents folder',
            details: `
                Give a name, or --private for the user's own private collection, where files at the top of the
                documents folder go. A name already taken is refused; --private changes nothing when the private
                collection exists. Share the collection afterwards with \`collection share\`.
            `,
            examples: [
                ['Create a collection', `${prefix} collection create "Knowledge base"`],
                ["Create the user's private collection", `${prefix} collection create --private`],
            ],
        });

        name = Option.String({ required: false });
        privateCollection = Option.Boolean('--private', false);

        override async run() {
            const { stdout } = this.context;
            const name = this.name?.trim();
            if ((name == null || name === '') === !this.privateCollection) {
                throw new UsageError('Give either a collection name or --private.');
            }
            const workspace = await openWorkspace();
            await withOutline(workspace, async client => {
                let collectionName: string;
                if (name == null || name === '') {
                    const lookup = await findPrivateCollection(client, options.privateCollection);
                    if (lookup.id != null) {
                        const at = folderOf(workspace, (await workspace.store.load()).collections[lookup.id]);
                        stdout.write(`The private collection "${lookup.name}" already exists${at}; nothing changed.\n`);
                        stdout.write(renderAccess(await collectionAccess(client, lookup.id)));
                        return;
                    }
                    collectionName = lookup.name;
                } else {
                    if ((await collectionsNamed(client, name)).length > 0) {
                        throw new UsageError(`An Outline collection named "${name}" already exists.`);
                    }
                    collectionName = name;
                }
                // `null` explicitly: a collection made here is never open to the whole workspace.
                const collection = await client.collections.create({ name: collectionName, permission: null });
                await pullAll(client, workspace, stdout);
                const at = folderOf(workspace, (await workspace.store.load()).collections[collection.id]);
                stdout.write(`Created the collection "${collection.name}"${at}.\n`);
                stdout.write(renderAccess(await collectionAccess(client, collection.id)));
            });
        }
    }

    class OutlineCollectionShareCommand extends Command {
        static override paths = [[prefix, 'collection', 'share']];
        static override usage = Command.Usage({
            category: 'Outline',
            description: 'Give Outline users or groups, or the whole workspace, edit access to a collection',
            details: `
                The collection is its folder in the documents folder or its exact name. Each name is a user's full
                name or e-mail, or a group's name, as Outline has it; --everyone opens the collection to the whole
                workspace. Prints who can reach the collection after.
            `,
            examples: [
                ['Share with a person and a group', `${prefix} collection share documents/wiki "Ania Kowalska" zespol`],
                ['Open to the whole workspace', `${prefix} collection share "Knowledge base" --everyone`],
            ],
        });

        collection = Option.String({ required: true });
        names = Option.Rest();
        everyone = Option.Boolean('--everyone', false);

        override async run() {
            await changeCollectionAccess(this.context.stdout, this.collection, this.names, {
                everyone: this.everyone ? 'read_write' : undefined,
                apply: shareCollection,
            });
        }
    }

    class OutlineCollectionUnshareCommand extends Command {
        static override paths = [[prefix, 'collection', 'unshare']];
        static override usage = Command.Usage({
            category: 'Outline',
            description: 'Remove users or groups from a collection, or close it to the whole workspace',
            details: '--everyone leaves the collection to its members only. Prints who can reach the collection after.',
            examples: [['Close to the workspace', `${prefix} collection unshare "Knowledge base" --everyone`]],
        });

        collection = Option.String({ required: true });
        names = Option.Rest();
        everyone = Option.Boolean('--everyone', false);

        override async run() {
            await changeCollectionAccess(this.context.stdout, this.collection, this.names, {
                everyone: this.everyone ? null : undefined,
                apply: unshareCollection,
            });
        }
    }

    class OutlineCollectionSharesCommand extends Command {
        static override paths = [[prefix, 'collection', 'shares']];
        static override usage = Command.Usage({
            category: 'Outline',
            description: 'List who can reach a collection: the whole workspace, its members and groups',
        });

        collection = Option.String({ required: true });

        override async run() {
            const workspace = await openWorkspace();
            await withOutline(workspace, async client => {
                const id = await resolveCollection(client, workspace, this.collection);
                this.context.stdout.write(renderAccess(await collectionAccess(client, id)));
            });
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
                    tokenStore: outlineTokenStore({ url, keychain: options.keychain }),
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

    return [
        OutlineLoginCommand,
        OutlinePullCommand,
        OutlineSyncCommand,
        OutlineShareCommand,
        OutlineUnshareCommand,
        OutlineSharesCommand,
        OutlineCollectionCreateCommand,
        OutlineCollectionShareCommand,
        OutlineCollectionUnshareCommand,
        OutlineCollectionSharesCommand,
        OutlineHookCommand,
    ];

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
                store: outlineTokenStore({ url, keychain: options.keychain }),
                lock: { kind: 'held' },
            }),
        });
    }

    /** Resolves every name first, so a typo changes nothing; then applies the change to each and prints the shares. */
    async function changeShares(
        stdout: Writable,
        file: string,
        names: string[],
        apply: (client: OutlineClient, id: string, target: ShareTarget) => Promise<void>,
    ) {
        await withDocument(file, async (client, id) => {
            const targets: ShareTarget[] = [];
            for (const name of names) {
                targets.push(await findShareTarget(client, name));
            }
            for (const target of targets) {
                await apply(client, id, target);
            }
            stdout.write(renderShares(await directShares(client, id)));
        });
    }

    /**
     * Resolves the names and the collection first, so a typo changes nothing; then sets the workspace-wide
     * permission (`everyone`, left alone when `undefined`), applies the change to each name and prints the access.
     */
    async function changeCollectionAccess(
        stdout: Writable,
        collection: string,
        names: string[],
        change: {
            everyone: 'read_write' | null | undefined;
            apply: (client: OutlineClient, id: string, target: ShareTarget) => Promise<void>;
        },
    ) {
        if (names.length === 0 && change.everyone === undefined) {
            throw new UsageError('Name at least one user or group, or give --everyone.');
        }
        const workspace = await openWorkspace();
        await withOutline(workspace, async client => {
            const id = await resolveCollection(client, workspace, collection);
            const targets: ShareTarget[] = [];
            for (const name of names) {
                targets.push(await findShareTarget(client, name));
            }
            if (change.everyone !== undefined) {
                await client.collections.update({ id, permission: change.everyone });
            }
            for (const target of targets) {
                await change.apply(client, id, target);
            }
            stdout.write(renderAccess(await collectionAccess(client, id)));
        });
    }

    /**
     * The id of the collection `collection` names: a collection's folder in the documents folder (see `locate`), or
     * else the collection's exact name. Throws a `UsageError` or `ShareTargetError` when it matches none or several.
     */
    async function resolveCollection(client: OutlineClient, workspace: Workspace, collection: string) {
        const path = await locate(workspace, collection);
        if (path != null && isInside(workspace.documentsDir, path)) {
            const collectionFolder = relative(workspace.documentsDir, path);
            const { collections } = await workspace.store.load();
            const id = Object.keys(collections).find(key => collections[key] === collectionFolder);
            if (id == null) {
                throw new UsageError(`${collection} is not the folder of a synced collection.`);
            }
            return id;
        }
        return (await findCollection(client, collection)).id;
    }

    /** Runs `work` on the Outline document `file` (see `locate`) is synced with. */
    async function withDocument(file: string, work: (client: OutlineClient, id: string) => Promise<void>) {
        const workspace = await openWorkspace();
        const path = await locate(workspace, file);
        const content = path == null ? null : await readFile(path, 'utf8').catch(() => null);
        if (content == null) {
            throw new UsageError(`Cannot read ${file}.`);
        }
        const { id } = parseDocFile(content, basename(file)).doc;
        if (id == null) {
            throw new UsageError(
                `${file} is not in Outline yet (no \`outline:\` id in its frontmatter); run \`${commandHint} sync\` first.`,
            );
        }
        await withOutline(workspace, client => work(client, id));
    }

    /** Runs `work` under the sync lock, turning a name matching nobody and a refusal from Outline into usage errors. */
    async function withOutline(workspace: Workspace, work: (client: OutlineClient) => Promise<void>) {
        const client = heldClient();
        await withLock(workspace, async () => {
            try {
                await work(client);
            } catch (error) {
                if (error instanceof ShareTargetError || error instanceof OutlineApiError) {
                    throw new UsageError(error.message);
                }
                throw error;
            }
        });
    }

    /** A full pull, batch after batch until it is done; returns how many files it wrote. The caller holds the lock. */
    async function pullAll(client: OutlineClient, workspace: Workspace, stdout: Writable): Promise<number> {
        let written = 0;
        for (;;) {
            const report = await pull({
                client,
                store: workspace.store,
                state: await workspace.store.load(),
                documentsDir: workspace.documentsDir,
                recoveredDir: workspace.recoveredDir,
                mode: 'full',
                deadline: { afterDiscoveryMs: PULL_BATCH_MS },
            });
            written += report.written.length;
            if (!report.stoppedAtDeadline) {
                return written;
            }
            stdout.write(`${written} files written so far, continuing…\n`);
        }
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

/**
 * `path` relative to the current directory when something is there, or else relative to the repo's main checkout:
 * the CLI runs in a worktree while the documents live in the main checkout. `null` when it is in neither.
 */
async function locate(workspace: Workspace, path: string): Promise<string | null> {
    for (const base of [process.cwd(), workspace.mainDir]) {
        const candidate = resolve(base, path);
        if (await pathExists(candidate)) {
            return candidate;
        }
    }
    return null;
}

/** ` in <folder>/`, the collection's folder relative to the main checkout; empty when it has none yet. */
function folderOf(workspace: Workspace, folder: string | undefined): string {
    return folder == null ? '' : ` in ${relative(workspace.mainDir, join(workspace.documentsDir, folder))}/`;
}

function renderAccess(access: CollectionAccess): string {
    const { collection } = access;
    const lines = [
        collection.permission == null
            ? '- only its members, not the whole workspace'
            : `- everyone in the workspace (${collection.permission})`,
        ...access.users.map(({ user, permission }) => `- ${user.name} <${user.email}> (${permission})`),
        ...access.groups.map(({ group, permission }) => `- group ${group.name} (${permission})`),
    ];
    return `Access to the collection "${collection.name}":\n${lines.join('\n')}\n`;
}

function renderShares(shares: DirectShare[]): string {
    if (shares.length === 0) {
        return 'Not shared with anyone directly.\n';
    }
    const lines = shares.map(item =>
        item.kind === 'user'
            ? `- ${item.user.name} <${item.user.email}> (${item.permission})`
            : `- group ${item.group.name} (${item.permission})`,
    );
    return `Shared directly with:\n${lines.join('\n')}\n`;
}

function isHookEvent(value: string): value is HookEvent {
    return HOOK_EVENTS.some(event => event === value);
}

/** A terminal gives no hook input; waiting for one would hang. */
async function readStdin(stdin: Readable): Promise<string> {
    return 'isTTY' in stdin && stdin.isTTY === true ? '' : await text(stdin);
}
