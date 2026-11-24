import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { OutlineTokenStore, StoredOutlineTokens } from '../auth/tokens.js';
import { fakeOutline } from '../outline/fakeOutline.js';
import type { OutlineFetch } from '../outline/OutlineClient.js';
import type { OutlineDocument } from '../outline/OutlineTypes.js';
import { tryAcquireLock } from '../state/lock.js';
import { StateStore } from '../state/StateStore.js';
import { runHook } from './hook.js';
import type { HookEvent, RunHookOptions } from './hook.js';

const TEXT = 'First paragraph.\n\nSecond paragraph.';
const MINUTE = 60 * 1000;
const REFRESH_TOKEN = 'ol_rt_never_printed';

test('session start in a worktree pulls into the main checkout, names the new files, and a quiet run says nothing', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer');

    const output = await world.hook('session-start', { from: 'worktree' });

    expect(JSON.parse(output)).toMatchObject({ hookSpecificOutput: { hookEventName: 'SessionStart' } });
    const context = contextOf(output);
    expect(context).toContain(`\`${world.main}/documents/wiki/offer.md\``);
    expect(context).toContain('Re-read a file before editing it.');
    expect(await world.read('wiki/offer.md')).toContain(`outline: ${offer.id}`);
    // The worktree shares the main checkout's folder and the clone's state rather than getting its own.
    await expect(readFile(join(world.worktree, 'documents/wiki/offer.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await world.store.load()).documents[offer.id]?.path).toBe('wiki/offer.md');

    world.clock += 2 * MINUTE;
    expect(await world.hook('prompt')).toBe('');
});

test('a prompt pulls at most once a minute, and not at all while another session holds the lock', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer');
    await world.hook('session-start');
    await world.outline.clientAs(world.bob).documents.update({ id: offer.id, text: 'Changed by Bob.' });

    world.clock += 30 * 1000;
    const requests = world.outline.requests.length;
    expect(await world.hook('prompt')).toBe('');
    expect(world.outline.requests.length).toBe(requests);

    world.clock += MINUTE;
    const held = await tryAcquireLock(world.store.lockPath);
    expect(await world.hook('prompt')).toBe('');
    expect(world.outline.requests.length).toBe(requests);
    await held?.release();

    const output = await world.hook('prompt');
    expect(JSON.parse(output)).toMatchObject({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit' } });
    expect(contextOf(output)).toContain('`documents/wiki/offer.md`');
    expect(await world.read('wiki/offer.md')).toContain('Changed by Bob.');
});

test('stop blocks once for a conflict its push created, never right after a block nor again for the same conflict', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer');
    const plan = world.addDocument('Plan');
    await world.hook('session-start');

    // A conflict created by the Stop that follows a block is not blocked on.
    await world.conflict(offer, 'wiki/offer.md');
    expect(await world.hook('stop', { input: { stop_hook_active: true } })).toBe('');
    expect(await world.read('wiki/offer.md')).toContain('>>>>>>> Outline (Bob)');

    await world.conflict(plan, 'wiki/plan.md');
    const blocked = await world.hook('stop', { input: { stop_hook_active: false } });
    expect(JSON.parse(blocked)).toMatchObject({ decision: 'block' });
    const reason = fieldOf(JSON.parse(blocked), 'reason');
    expect(reason).toContain('conflict in `documents/wiki/plan.md`: the same paragraph');
    expect(reason).toContain('ask which to keep');
    expect(await world.hook('stop', { input: { stop_hook_active: false } })).toBe('');

    // Both stay in every report until they are resolved.
    world.clock += 2 * MINUTE;
    expect(contextOf(await world.hook('prompt'))).toContain(
        'conflict in `documents/wiki/offer.md`, `documents/wiki/plan.md`:',
    );
});

test('a prompt that does not sync still reminds of an open conflict, and leaves one-time events for the next run', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer');
    await world.hook('session-start');
    await world.conflict(offer, 'wiki/offer.md');
    await world.hook('stop');
    const state = await world.store.load();
    await world.store.save({ ...state, events: [{ kind: 'recovered', path: 'wiki/plan.md' }] });
    const requests = world.outline.requests.length;

    world.clock += 30 * 1000;
    const recent = contextOf(await world.hook('prompt'));
    expect(recent).toContain('conflict in `documents/wiki/offer.md`:');
    expect(recent).not.toContain('moved to recovered/');

    world.clock += MINUTE;
    const held = await tryAcquireLock(world.store.lockPath);
    expect(contextOf(await world.hook('prompt'))).toContain('conflict in `documents/wiki/offer.md`:');
    expect(contextOf(await world.hook('session-start'))).toContain('conflict in `documents/wiki/offer.md`:');
    await held?.release();

    expect(world.outline.requests.length).toBe(requests);
    expect((await world.store.load()).events).toEqual([{ kind: 'recovered', path: 'wiki/plan.md' }]);
});

test('a missing login is told once per session, with the command that logs in; an offline Outline likewise', async () => {
    const world = await setup({ tokens: null });

    const first = contextOf(await world.hook('session-start', { session: 'one' }));
    expect(first).toContain('Run `bun cli outline login` yourself now');
    world.clock += 2 * MINUTE;
    expect(contextOf(await world.hook('prompt', { session: 'one' }))).not.toContain('login');
    world.clock += 2 * MINUTE;
    expect(contextOf(await world.hook('prompt', { session: 'two' }))).toContain('`bun cli outline login`');

    const offline = await setup({ fetch: () => Promise.reject(new Error('getaddrinfo ENOTFOUND')) });
    expect(contextOf(await offline.hook('session-start', { session: 'one' }))).toContain('Outline cannot be reached');
    offline.clock += 2 * MINUTE;
    expect(contextOf(await offline.hook('prompt', { session: 'one' }))).not.toContain('cannot be reached');
});

test('the hook prints nothing or valid output, whatever breaks', async () => {
    const world = await setup();
    world.addDocument('Offer');
    await world.hook('session-start');

    // The documents folder is gone: nothing is archived, and the agent is told.
    await rm(join(world.main, 'documents'), { recursive: true });
    world.clock += 2 * MINUTE;
    const missing = await world.hook('prompt', { rawInput: 'not json' });
    expect(contextOf(missing)).toContain('The documents folder is missing');

    await writeFile(join(world.store.dir, 'state.json'), '{ broken');
    for (const event of ['session-start', 'prompt'] satisfies HookEvent[]) {
        world.clock += 2 * MINUTE;
        expect(contextOf(await world.hook(event))).toContain(
            `Outline sync failed; details in ${world.store.dir}/hook.log`,
        );
    }
    expect(await world.hook('stop')).toBe('');
    expect(await world.hook('session-end')).toBe('');
    expect(await readFile(join(world.store.dir, 'hook.log'), 'utf8')).toContain('StateCorruptError');

    const outside = await realpath(await mkdtemp(join(tmpdir(), 'not-a-repo-')));
    expect(await world.hook('session-start', { cwd: outside })).toBe('');
});

test('tokens never reach the output or the log, even when Outline echoes one back', async () => {
    const world = await setup({
        fetch: (url, init) =>
            url.endsWith('/api/collections.list')
                ? Promise.resolve(
                      Response.json(
                          { ok: false, error: 'bad', message: `refused ${world.ana.token} / ${REFRESH_TOKEN}` },
                          { status: 400 },
                      ),
                  )
                : world.outline.fetch(url, init),
    });
    world.addDocument('Offer');

    const output = await world.hook('session-start');

    expect(contextOf(output)).toContain('Outline sync failed');
    const log = await readFile(join(world.store.dir, 'hook.log'), 'utf8');
    expect(log).toContain('collections.list failed (400)');
    for (const text of [output, log]) {
        expect(text).not.toContain(world.ana.token);
        expect(text).not.toContain(REFRESH_TOKEN);
    }
});

test('one-time events are reported by the first run that sees them, then dropped', async () => {
    const world = await setup();
    await world.hook('session-start');
    const state = await world.store.load();
    await world.store.save({ ...state, events: [{ kind: 'recovered', path: 'wiki/plan.md' }] });

    world.clock += 2 * MINUTE;
    expect(contextOf(await world.hook('prompt'))).toContain('moved to recovered/: `recovered/wiki/plan.md`');
    world.clock += 2 * MINUTE;
    expect(await world.hook('prompt')).toBe('');
    expect((await world.store.load()).events).toEqual([]);
});

test('without the private collection a new file at the top of the folder is not created, and the agent is told', async () => {
    const world = await setup({ privateCollection: 'Nowhere' });
    await world.hook('session-start');
    await world.write('idea.md', '# Idea\n\nSomething new.');

    world.clock += 2 * MINUTE;
    const context = contextOf(await world.hook('prompt'));

    expect(context).toContain('"Nowhere", which does not exist, so these were not sent: `documents/idea.md`');
    expect(world.outline.requests.filter(request => request.method === 'documents.create')).toEqual([]);
});

test('a collection with the right name but another member is not private, and the agent is told why', async () => {
    const world = await setup({ privateCollection: 'Shared by admin' });
    world.outline.addCollection({
        name: 'Shared by admin',
        members: [
            { user: world.ana, permission: 'admin' },
            { user: world.bob, permission: 'admin' },
        ],
    });
    await world.hook('session-start');
    await world.write('idea.md', '# Idea\n\nSomething new.');

    world.clock += 2 * MINUTE;
    const context = contextOf(await world.hook('prompt'));

    expect(context).toContain('"Shared by admin", which exists but is shared with 1 other member(s) or group(s)');
    expect(context).toContain('Run `bun cli outline collection create --private` yourself');
    expect(world.outline.requests.filter(request => request.method === 'documents.create')).toEqual([]);
});

test('a collection shared with a group is not private either', async () => {
    const world = await setup({ privateCollection: 'Group shared' });
    const team = world.outline.addGroup({ name: 'Team', members: [world.ana] });
    world.outline.addCollection({
        name: 'Group shared',
        members: [{ user: world.ana, permission: 'admin' }],
        groups: [{ group: team, permission: 'read_write' }],
    });
    await world.hook('session-start');
    await world.write('idea.md', '# Idea\n\nSomething new.');

    world.clock += 2 * MINUTE;

    expect(contextOf(await world.hook('prompt'))).toContain('shared with 1 other member(s) or group(s)');
});

test('session end sends local edits and prints nothing', async () => {
    const world = await setup();
    const offer = world.addDocument('Offer');
    await world.hook('session-start');
    const local = await world.read('wiki/offer.md');
    await world.write('wiki/offer.md', local.replace('Second paragraph.', 'Second paragraph, revised.'));

    expect(await world.hook('session-end')).toBe('');
    expect(world.outline.getDocument(offer.id)?.text).toBe('First paragraph.\n\nSecond paragraph, revised.');
});

interface SetupOptions {
    /** `null` for no login. */
    tokens?: null;
    fetch?: OutlineFetch;
    privateCollection?: string;
}

interface HookCall {
    session?: string;
    input?: Record<string, unknown>;
    /** Replaces the JSON input altogether. */
    rawInput?: string;
    from?: 'main' | 'worktree';
    cwd?: string;
}

async function setup(options: SetupOptions = {}) {
    const outline = fakeOutline();
    const ana = outline.addUser({ name: 'Ana' });
    const bob = outline.addUser({ name: 'Bob' });
    const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
    outline.addCollection({ name: 'Ana private', members: [{ user: ana, permission: 'admin' }] });

    const root = await realpath(await mkdtemp(join(tmpdir(), 'outline-hook-')));
    const main = join(root, 'main');
    const worktree = join(root, 'worktree');
    await mkdir(main);
    await git(main, 'init', '--quiet');
    await git(
        main,
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.test',
        'commit',
        '--quiet',
        '--allow-empty',
        '-m',
        'init',
    );
    await git(main, 'worktree', 'add', '--quiet', '-b', 'side', worktree);

    const stored: StoredOutlineTokens | null =
        options.tokens === null
            ? null
            : { accessToken: ana.token, accessTokenExpiresAt: Date.now() + 60 * MINUTE, refreshToken: REFRESH_TOKEN };
    const tokenStore: OutlineTokenStore = {
        read: () => Promise.resolve(stored),
        write: () => Promise.resolve(),
    };

    const world = {
        outline,
        ana,
        bob,
        main,
        worktree,
        store: new StateStore(join(main, '.git', 'outline-sync')),
        clock: Date.now(),
        addDocument: (title: string): OutlineDocument =>
            outline.addDocument({ collection: wiki, title, text: TEXT, createdBy: ana }),
        read: (path: string) => readFile(join(main, 'documents', path), 'utf8'),
        write: async (path: string, content: string) => {
            await mkdir(join(main, 'documents', path, '..'), { recursive: true });
            await writeFile(join(main, 'documents', path), content);
        },
        /** An edit of the first paragraph here, and another of the same paragraph by Bob in Outline. */
        conflict: async (document: OutlineDocument, path: string) => {
            const local = await world.read(path);
            await world.write(path, local.replace('First paragraph.', 'First paragraph, edited here.'));
            await outline.clientAs(bob).documents.update({
                id: document.id,
                text: TEXT.replace('First paragraph.', 'First paragraph, by Bob.'),
            });
        },
        hook: (event: HookEvent, call: HookCall = {}) => {
            const hookOptions: RunHookOptions = {
                event,
                input: call.rawInput ?? JSON.stringify({ session_id: call.session ?? 'session-1', ...call.input }),
                cwd: call.cwd ?? (call.from === 'worktree' ? worktree : main),
                url: outline.url,
                clientId: 'client-1',
                folder: 'documents',
                recovered: 'recovered',
                privateCollection: user => options.privateCollection ?? `${user.name} private`,
                commandHint: 'bun cli outline',
                tokenStore,
                fetch: options.fetch ?? outline.fetch,
                now: () => world.clock,
            };
            return runHook(hookOptions);
        },
    };
    return world;
}

/** The `additionalContext` of a session start or prompt output; empty for no output. */
function contextOf(output: string): string {
    if (output === '') {
        return '';
    }
    const parsed: unknown = JSON.parse(output);
    return fieldOf(isPlainObject(parsed) ? parsed.hookSpecificOutput : undefined, 'additionalContext');
}

function fieldOf(value: unknown, name: string): string {
    const field = isPlainObject(value) ? value[name] : undefined;
    expect(typeof field).toBe('string');
    return String(field);
}

async function git(cwd: string, ...args: string[]) {
    const child = Bun.spawn(['git', ...args], { cwd, stdout: 'ignore', stderr: 'pipe' });
    if ((await child.exited) !== 0) {
        throw new Error(`git ${args.join(' ')} failed: ${await new Response(child.stderr).text()}`);
    }
}
