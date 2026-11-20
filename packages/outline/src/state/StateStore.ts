import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { readTextIfExists } from '../utils/readTextIfExists.js';
import { writeFileAtomic } from '../utils/writeFileAtomic.js';

/** What sync remembers about one Outline document. */
export interface DocState {
    id: string;
    /** Relative to the documents folder. */
    path: string;
    revision: number;
    title: string;
    parentId: string | null;
    /** `null` for a draft outside any collection. */
    collectionId: string | null;
    /** Hash of the local file as sync last wrote or read it; a different hash means a local edit. */
    localHash: string;
    /** The Outline revision an open conflict was merged against. */
    conflictRevision?: number;
    /** The file's stat when it was last seen to hash to `localHash`; a file still matching it is not read again. */
    fileStat?: FileStat;
}

/** What identifies an unchanged file without reading it: an edit changes the mtime, an atomic save the inode too. */
export interface FileStat {
    mtimeMs: number;
    size: number;
    ino: number;
}

/** A one-time fact for the agent, removed by whoever reports it. */
export type SyncEvent = { kind: 'recovered'; path: string };

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
    /** ISO time the hook last pulled (or tried to); the prompt hook pulls at most once a minute. */
    lastPullAt?: string;
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
        const text = await readTextIfExists(this.statePath);
        if (text === null) {
            return emptyState();
        }
        let parsed: SyncState;
        try {
            parsed = JSON.parse(text) as SyncState;
        } catch (error) {
            throw new StateCorruptError(this.statePath, error instanceof Error ? error.message : 'invalid JSON');
        }
        if (parsed?.version !== 1) {
            throw new StateCorruptError(this.statePath, 'unexpected version');
        }
        return parsed;
    }

    async save(state: SyncState): Promise<void> {
        await writeFileAtomic(this.statePath, JSON.stringify(state, null, 2));
    }

    /** The last canonical content of the document, the base of a 3-way merge; `null` when none is stored. */
    async readBase(id: string): Promise<string | null> {
        return readTextIfExists(this.basePath(id));
    }

    async writeBase(id: string, content: string): Promise<void> {
        await writeFileAtomic(this.basePath(id), content);
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
