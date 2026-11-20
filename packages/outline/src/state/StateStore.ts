import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

/** What sync remembers about one Outline document. */
export interface DocState {
    id: string;
    /** Relative to the documents folder. */
    path: string;
    revision: number;
    title: string;
    parentId: string | null;
    collectionId: string;
    /** The share list as sync last wrote it into the file's frontmatter. */
    shared: string[];
    /** Hash of the local file as sync last wrote or read it; a different hash means a local edit. */
    localHash: string;
    /** The Outline revision an open conflict was merged against. */
    conflictRevision?: number;
}

/** A one-time fact for the agent, removed by whoever reports it. */
export type SyncEvent =
    | { kind: 'recovered'; path: string }
    | { kind: 'share-rejected'; path: string; email: string; reason: string };

export interface InitialPull {
    complete: boolean;
    /** Where an interrupted first pull resumes; `null` before it started. */
    position: string | null;
}

export interface SyncState {
    version: 1;
    /** By Outline document id. */
    documents: Record<string, DocState>;
    /** File path to the id created for it, recorded before the id reaches the file's frontmatter, so a killed hook never creates the document twice. */
    pendingCreates: Record<string, string>;
    events: SyncEvent[];
    /** ISO time of the incremental pull's position. */
    cursor: string | null;
    lastFullPass: string | null;
    initialPull: InitialPull;
    /** Collection id to its folder name. */
    collections: Record<string, string>;
    /** Per message kind, the `session_id`s already told. */
    toldSessions: Record<string, string[]>;
}

/** `state.json` exists but cannot be used. It is never replaced: it holds the merge bases' bookkeeping. */
export class StateCorruptError extends Error {
    constructor(
        readonly path: string,
        reason: string,
    ) {
        super(`Sync state ${path} is unreadable: ${reason}`);
        this.name = 'StateCorruptError';
    }
}

/** The state directory shared by every worktree of one clone: `state.json`, `base/<id>.md` and `lock`. */
export class StateStore {
    readonly lockPath: string;
    private readonly statePath: string;
    private readonly baseDir: string;

    constructor(readonly dir: string) {
        this.lockPath = join(dir, 'lock');
        this.statePath = join(dir, 'state.json');
        this.baseDir = join(dir, 'base');
    }

    /** The saved state, or an empty one when none was ever saved. Throws `StateCorruptError` for a broken file. */
    async load(): Promise<SyncState> {
        const text = await readIfExists(this.statePath);
        if (text === null) {
            return emptyState();
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch (error) {
            throw new StateCorruptError(this.statePath, error instanceof Error ? error.message : 'invalid JSON');
        }
        if (!isSyncState(parsed)) {
            throw new StateCorruptError(this.statePath, 'unexpected structure or version');
        }
        return parsed;
    }

    async save(state: SyncState): Promise<void> {
        await writeAtomic(this.statePath, JSON.stringify(state, null, 2));
    }

    /** The last canonical content of the document, the base of a 3-way merge; `null` when none is stored. */
    async readBase(id: string): Promise<string | null> {
        return readIfExists(this.basePath(id));
    }

    async writeBase(id: string, content: string): Promise<void> {
        await writeAtomic(this.basePath(id), content);
    }

    async deleteBase(id: string): Promise<void> {
        await rm(this.basePath(id), { force: true });
    }

    private basePath(id: string): string {
        if (!/^[\w-]+$/.test(id)) {
            throw new Error(`Not a document id: ${id}`);
        }
        return join(this.baseDir, `${id}.md`);
    }
}

function emptyState(): SyncState {
    return {
        version: 1,
        documents: {},
        pendingCreates: {},
        events: [],
        cursor: null,
        lastFullPass: null,
        initialPull: { complete: false, position: null },
        collections: {},
        toldSessions: {},
    };
}

/** Writes to a temp file in the same folder and renames it over `path`, so a crash leaves the old or the new content, never a half. */
async function writeAtomic(path: string, content: string): Promise<void> {
    await mkdir(join(path, '..'), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    const file = await open(temp, 'w');
    try {
        await file.writeFile(content);
        await file.sync();
    } finally {
        await file.close();
    }
    await rename(temp, path);
}

async function readIfExists(path: string): Promise<string | null> {
    try {
        return await readFile(path, 'utf8');
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

function isSyncState(value: unknown): value is SyncState {
    return (
        isRecord(value) &&
        value.version === 1 &&
        isRecord(value.documents) &&
        Object.values(value.documents).every(isDocState) &&
        isStringRecord(value.pendingCreates) &&
        Array.isArray(value.events) &&
        value.events.every(isSyncEvent) &&
        isStringOrNull(value.cursor) &&
        isStringOrNull(value.lastFullPass) &&
        isRecord(value.initialPull) &&
        typeof value.initialPull.complete === 'boolean' &&
        isStringOrNull(value.initialPull.position) &&
        isStringRecord(value.collections) &&
        isRecord(value.toldSessions) &&
        Object.values(value.toldSessions).every(isStringArray)
    );
}

function isDocState(value: unknown): value is DocState {
    return (
        isRecord(value) &&
        typeof value.id === 'string' &&
        typeof value.path === 'string' &&
        typeof value.revision === 'number' &&
        typeof value.title === 'string' &&
        isStringOrNull(value.parentId) &&
        typeof value.collectionId === 'string' &&
        isStringArray(value.shared) &&
        typeof value.localHash === 'string' &&
        (value.conflictRevision === undefined || typeof value.conflictRevision === 'number')
    );
}

function isSyncEvent(value: unknown): value is SyncEvent {
    if (!isRecord(value) || typeof value.path !== 'string') {
        return false;
    }
    switch (value.kind) {
        case 'recovered':
            return true;
        case 'share-rejected':
            return typeof value.email === 'string' && typeof value.reason === 'string';
        default:
            return false;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isStringRecord(value: unknown): value is Record<string, string> {
    return isRecord(value) && Object.values(value).every(item => typeof item === 'string');
}

function isStringOrNull(value: unknown): value is string | null {
    return value === null || typeof value === 'string';
}
