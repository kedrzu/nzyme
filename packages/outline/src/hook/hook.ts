import { appendFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { assertNever } from '@nzyme/utils/assertNever.js';

import { LoginRequiredError, TokenRequestError, createTokenProvider } from '../auth/tokens.js';
import type { OutlineTokenStore } from '../auth/tokens.js';
import { OutlineApiError, OutlineNetworkError } from '../outline/errors.js';
import { OutlineClient } from '../outline/OutlineClient.js';
import type { OutlineFetch } from '../outline/OutlineClient.js';
import type { OutlineUser } from '../outline/OutlineTypes.js';
import { acquireLock, tryAcquireLock } from '../state/lock.js';
import type { LockHandle } from '../state/lock.js';
import type { StateStore, SyncState } from '../state/StateStore.js';
import { isErrorCode } from '../utils/isErrorCode.js';
import { resolveWorkspace } from '../sync/resolveWorkspace.js';
import type { Workspace } from '../sync/resolveWorkspace.js';
import { syncOnce } from '../sync/syncOnce.js';
import type { SyncDeadlines, SyncRun } from '../sync/syncOnce.js';
import { renderFailure, renderLoginNeeded, renderOffline, renderReport, renderStopBlock } from './messages.js';

/** The Claude Code hook events the sync runs on, as `outline hook <event>` names them. */
export const HOOK_EVENTS = ['session-start', 'prompt', 'stop', 'session-end'] as const;

export type HookEvent = (typeof HOOK_EVENTS)[number];

export interface RunHookOptions {
    event: HookEvent;
    /** The hook's JSON input, as read from stdin; anything unreadable counts as `{}`. */
    input: string;
    /** `CLAUDE_PROJECT_DIR` when set: preferred over the input's `cwd`, which follows the agent into sub-folders. */
    projectDir?: string;
    /** Used when neither the project dir nor the input's `cwd` is known. */
    cwd: string;
    url: string;
    clientId: string;
    folder: string;
    recovered: string;
    privateCollection: (user: OutlineUser) => string;
    commandHint: string;
    /** The language the agent speaks to the user, e.g. `Polish`. */
    userLanguage?: string;
    tokenStore: OutlineTokenStore;
    fetch?: OutlineFetch;
    /** The clock of the throttle and the deadlines. */
    now?: () => number;
}

/** What the hook reads from its input; every field is optional, as a broken input must not stop the hook. */
interface HookInput {
    sessionId?: string;
    cwd?: string;
    stopHookActive: boolean;
}

type FailureKind = 'login' | 'offline' | 'failure';

/** Steps start no new document after these offsets from the hook's start, keeping a run under 40 s of a 60 s hook timeout. */
const PULL_BUDGET_MS = 20 * 1000;
const PUSH_BUDGET_MS = 32 * 1000;
const SHARING_BUDGET_MS = 38 * 1000;
const STOP_LOCK_WAIT_MS = 15 * 1000;
const SESSION_END_LOCK_WAIT_MS = 5 * 1000;
const PROMPT_INTERVAL_MS = 60 * 1000;
const FULL_PASS_INTERVAL_MS = 15 * 60 * 1000;
/** Session ids remembered per message kind; older ones are forgotten. */
const TOLD_KEPT = 50;
const LOG_LIMIT_BYTES = 1024 * 1024;

/**
 * Runs one Claude Code hook event and returns what the hook prints: `additionalContext` JSON for session start
 * and prompt, a Stop block for a conflict the push just created, otherwise nothing. Never throws: a sync must
 * never break the session.
 *
 * - session-start: a full pass (pull, push, sharing), skipped while another session syncs.
 * - prompt: at most once a minute, an incremental pass (a full one every 15 minutes), skipped while another
 *   session syncs. Only these two pull: a file never changes under the agent in the middle of its turn.
 * - stop: waits up to 15 s for the lock, then push and sharing; blocks once for a conflict it created.
 * - session-end: push and sharing; what it would say stays in the state for the next session.
 */
export async function runHook(options: RunHookOptions): Promise<string> {
    try {
        return await handleHook(options);
    } catch {
        // What the run cannot report itself (no git, an unwritable state dir, a state unreadable at the end): the session goes on.
        return '';
    }
}

async function handleHook(options: RunHookOptions): Promise<string> {
    const { event } = options;
    const input = parseInput(options.input);
    const now = options.now ?? Date.now;
    const started = now();
    const workspace = await resolveWorkspace({
        cwd: options.projectDir ?? input.cwd ?? options.cwd,
        folder: options.folder,
        recovered: options.recovered,
    });
    if (workspace == null) {
        return '';
    }
    const { store } = workspace;
    if (event === 'prompt' && (await pulledRecently(store, started))) {
        return '';
    }
    const lock = await takeLock(event, store.lockPath);
    if (lock == null) {
        return '';
    }
    try {
        return await runLocked({ options, input, workspace, started, now });
    } finally {
        await lock.release();
    }
}

interface RunLockedParams {
    options: RunHookOptions;
    input: HookInput;
    workspace: Workspace;
    started: number;
    now: () => number;
}

async function runLocked({ options, input, workspace, started, now }: RunLockedParams): Promise<string> {
    const { event } = options;
    const { store } = workspace;
    const client = new OutlineClient({
        url: options.url,
        fetch: options.fetch,
        // The hook holds the sync lock for the whole run, so a refresh must not take it again.
        getAccessToken: createTokenProvider({
            url: options.url,
            clientId: options.clientId,
            store: options.tokenStore,
            lock: { kind: 'held' },
            fetch: options.fetch,
        }),
    });
    const run: SyncRun = {};
    let failure: unknown = null;
    let conflictsBefore = new Set<string>();
    try {
        const state = await store.load();
        conflictsBefore = conflictKeys(state);
        const pulls = event === 'session-start' || event === 'prompt';
        const fullPass =
            event === 'session-start' ||
            state.lastFullPass == null ||
            started - Date.parse(state.lastFullPass) >= FULL_PASS_INTERVAL_MS;
        const deadlines: SyncDeadlines = {
            pull: pulls ? started + PULL_BUDGET_MS : undefined,
            push: started + PUSH_BUDGET_MS,
            sharing: started + SHARING_BUDGET_MS,
        };
        await syncOnce({
            client,
            workspace,
            mode: pulls && fullPass ? 'full' : 'incremental',
            deadlines,
            privateCollection: options.privateCollection,
            run,
            now,
        });
    } catch (error) {
        failure = error;
    }

    const kind = failure == null ? null : classify(failure);
    if (kind === 'failure') {
        await logFailure(store, event, failure, options.tokenStore);
    }

    switch (event) {
        case 'stop':
            return await stopOutput({
                workspace,
                input,
                folder: options.folder,
                userLanguage: options.userLanguage,
                before: conflictsBefore,
            });
        case 'session-end':
            return '';
        case 'session-start':
        case 'prompt': {
            const context = await report({ options, input, workspace, run, kind, started });
            if (context === '') {
                return '';
            }
            const hookEventName = event === 'session-start' ? 'SessionStart' : 'UserPromptSubmit';
            return JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: context } });
        }
        default:
            return assertNever(event);
    }
}

/** Blocks the Stop once for conflicts this push created; never right after a block (`stop_hook_active`). */
async function stopOutput(params: StopOutputParams): Promise<string> {
    const { workspace, input, before } = params;
    if (input.stopHookActive) {
        return '';
    }
    const state = await workspace.store.load();
    const created = Object.values(state.documents).filter(
        document =>
            document.conflictRevision != null && !before.has(conflictKey(document.id, document.conflictRevision)),
    );
    if (created.length === 0) {
        return '';
    }
    const paths = created.map(document => document.path).toSorted();
    const documents = prefix(workspace, workspace.documentsDir, params.folder);
    return JSON.stringify({ decision: 'block', reason: renderStopBlock(paths, documents, params.userLanguage) });
}

interface StopOutputParams {
    workspace: Workspace;
    input: HookInput;
    folder: string;
    userLanguage?: string;
    /** The open conflicts before the run, by `conflictKey`. */
    before: Set<string>;
}

interface ReportParams {
    options: RunHookOptions;
    input: HookInput;
    workspace: Workspace;
    run: SyncRun;
    kind: FailureKind | null;
    started: number;
}

/**
 * The context for session start and prompt. Reported one-time events leave the state, and a login or offline
 * message is recorded per session, so neither is repeated.
 */
async function report({ options, input, workspace, run, kind, started }: ReportParams): Promise<string> {
    const { store } = workspace;
    let state: SyncState | null = null;
    try {
        state = await store.load();
    } catch {
        // A corrupt state: the run already failed on it and is reported below; nothing can be recorded.
    }
    const paragraphs: string[] = [];
    if (kind != null && (state == null || firstTell(state, kind, input.sessionId))) {
        paragraphs.push(failureMessage(kind, options.commandHint, options.userLanguage, store));
    }
    if (state != null) {
        paragraphs.push(
            renderReport({
                run,
                state,
                documents: prefix(workspace, workspace.documentsDir, options.folder),
                recovered: prefix(workspace, workspace.recoveredDir, options.recovered),
                recoveredFiles: await listRecovered(workspace.recoveredDir),
                commandHint: options.commandHint,
                userLanguage: options.userLanguage,
            }),
        );
        state.events = [];
        state.lastPullAt = new Date(started).toISOString();
        await store.save(state);
    }
    return paragraphs.filter(paragraph => paragraph !== '').join('\n\n');
}

async function takeLock(event: HookEvent, path: string): Promise<LockHandle | null> {
    switch (event) {
        case 'session-start':
        case 'prompt':
            return await tryAcquireLock(path);
        case 'stop':
            return await acquireLock(path, { timeoutMs: STOP_LOCK_WAIT_MS });
        case 'session-end':
            return await acquireLock(path, { timeoutMs: SESSION_END_LOCK_WAIT_MS });
        default:
            return assertNever(event);
    }
}

async function pulledRecently(store: StateStore, now: number): Promise<boolean> {
    try {
        const { lastPullAt } = await store.load();
        return lastPullAt != null && now - Date.parse(lastPullAt) < PROMPT_INTERVAL_MS;
    } catch {
        // A corrupt state is reported by the run itself.
        return false;
    }
}

function parseInput(text: string): HookInput {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        parsed = null;
    }
    if (typeof parsed !== 'object' || parsed === null) {
        return { stopHookActive: false };
    }
    const sessionId: unknown = Reflect.get(parsed, 'session_id');
    const cwd: unknown = Reflect.get(parsed, 'cwd');
    return {
        sessionId: typeof sessionId === 'string' && sessionId !== '' ? sessionId : undefined,
        cwd: typeof cwd === 'string' && cwd !== '' ? cwd : undefined,
        stopHookActive: Reflect.get(parsed, 'stop_hook_active') === true,
    };
}

function classify(error: unknown): FailureKind {
    if (error instanceof LoginRequiredError) {
        return 'login';
    }
    if (error instanceof OutlineNetworkError) {
        return 'offline';
    }
    const status = error instanceof OutlineApiError || error instanceof TokenRequestError ? error.status : null;
    // A token request without a status never got an answer, or is held back after a recent failure.
    if (error instanceof TokenRequestError && status == null) {
        return 'offline';
    }
    return status != null && (status >= 500 || status === 429) ? 'offline' : 'failure';
}

function failureMessage(
    kind: FailureKind,
    commandHint: string,
    userLanguage: string | undefined,
    store: StateStore,
): string {
    switch (kind) {
        case 'login':
            return renderLoginNeeded(commandHint, userLanguage);
        case 'offline':
            return renderOffline();
        case 'failure':
            return renderFailure(logPath(store));
        default:
            return assertNever(kind);
    }
}

/** Records that this session was told about `kind`; false when it already was. Without a session id it always tells. */
function firstTell(state: SyncState, kind: FailureKind, sessionId: string | undefined): boolean {
    if (sessionId == null) {
        return true;
    }
    const told = state.toldSessions[kind] ?? [];
    if (told.includes(sessionId)) {
        return false;
    }
    state.toldSessions[kind] = [...told, sessionId].slice(-TOLD_KEPT);
    return true;
}

function conflictKeys(state: SyncState): Set<string> {
    return new Set(
        Object.values(state.documents).flatMap(document =>
            document.conflictRevision == null ? [] : [conflictKey(document.id, document.conflictRevision)],
        ),
    );
}

/** A conflict is new when its document had none, or one at another Outline revision. */
function conflictKey(id: string, revision: number): string {
    return `${id}@${revision}`;
}

/** A folder as the agent's session sees it: relative in the main checkout, absolute from another worktree. */
function prefix(workspace: Workspace, dir: string, relativeName: string): string {
    return workspace.workTree === workspace.mainDir ? `${relativeName}/` : `${dir}/`;
}

async function listRecovered(dir: string): Promise<string[]> {
    try {
        const entries = await readdir(dir, { recursive: true });
        return entries.filter(entry => entry.endsWith('.md')).toSorted();
    } catch (error) {
        if (isErrorCode(error, 'ENOENT')) {
            return [];
        }
        throw error;
    }
}

function logPath(store: StateStore): string {
    return join(store.dir, 'hook.log');
}

/** Appends the error to the log, with every stored token blanked out in case some message carried one. */
async function logFailure(store: StateStore, event: HookEvent, error: unknown, tokenStore: OutlineTokenStore) {
    let text = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
    try {
        const tokens = await tokenStore.read();
        for (const token of [tokens?.accessToken, tokens?.refreshToken]) {
            if (token) {
                text = text.replaceAll(token, '[token]');
            }
        }
    } catch {
        // No keychain: the client and the token requests already keep tokens out of their errors.
    }
    const path = logPath(store);
    const entry = `${new Date().toISOString()} ${event}: ${text}\n`;
    try {
        const size = (await stat(path)).size;
        if (size > LOG_LIMIT_BYTES) {
            await writeFile(path, entry);
            return;
        }
    } catch {
        // No log yet.
    }
    await appendFile(path, entry);
}
