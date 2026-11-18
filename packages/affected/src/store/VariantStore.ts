import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, rmdir, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { GitRepository } from '@nzyme/project-utils/git/GitRepository.js';
import { isErrorCode } from '@nzyme/utils/isErrorCode.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { getMd5Hash } from '@nzyme/crypto';

/**
 * Version of the stored variant format. Bumping it moves the store to a new `v<N>` directory, so a
 * variant written by another version is never read: such a test simply has no variant.
 */
const STORE_VERSION = 1;

/** Variants kept per test; recording one more evicts the least recently matched. */
const MAX_VARIANTS_PER_TEST = 20;

/** A test none of whose variants was recorded or matched for this long is gone (deleted or renamed): its directory is removed. */
const STALE_TEST_MS = 30 * 24 * 60 * 60 * 1000;

/** A temporary file younger than this may still be in a writer's hands, so cleanup leaves it. */
const TMP_GRACE_MS = 60 * 1000;

/** A test: its file, root-relative, and the path of titles within it (empty for a file-level unit). */
export interface TestUnit {
    file: string;
    title?: string[];
}

/**
 * The hash of a file as a variant depends on it:
 * - `{ body, top }` — any change to its runtime code (an executed file, a test's entry file);
 * - `{ top }` — a change to the code that runs when the module loads (a file imported by executed code);
 * - a string — the MD5 of its bytes, for a file with no structure to split (an image, a font, JSON,
 *   a script that does not parse).
 */
export type FileHash = { body?: string; top: string } | string;

/** Why a file belongs to the suite fingerprint rather than to one test. */
export type SuiteInputRole = 'trigger' | 'startup' | 'side-effect' | 'dynamic-import';

/** One file of a suite fingerprint. */
export interface SuiteInput {
    role: SuiteInputRole;
    hash: FileHash;
}

/**
 * What every test of a suite depends on, as it was when a variant was recorded: the full-run
 * triggers (and what they import), files whose functions ran at startup, modules imported for their
 * side effects and files with a computed dynamic import. A change to any input invalidates the
 * variant, and when no stored variant has a current suite fingerprint the suite runs in full.
 */
export interface SuiteFingerprint {
    /** Hash of `config` and `inputs`; equal fingerprints have equal hashes. */
    hash: string;
    /** Hash of the suite's selection config: changing the triggers invalidates every variant. */
    config: string;
    /** Root-relative path → input. */
    inputs: Record<string, SuiteInput>;
}

/** The code one passing run of a test depended on: it is skipped while all of it is unchanged. */
export interface Variant {
    unit: TestUnit;
    /** Root-relative path → hash. */
    files: Record<string, FileHash>;
    suite: SuiteFingerprint;
    /** ISO timestamp. */
    recordedAt: string;
}

/** A variant as stored, with the id that names its file. */
export interface StoredVariant {
    id: string;
    variant: Variant;
}

/**
 * The variants of one suite, in `<git-common-dir>/nzyme-affected/v<N>/<suite>/<hash(unit)>/<id>.json`.
 * The git common directory is shared by every worktree of a clone and never committed; a variant
 * depends on file contents only, so worktrees on different branches share it safely.
 *
 * Writes are atomic (a temporary file renamed into place), so a reader in another worktree sees a
 * whole variant or none. A file that does not parse or has another format version is skipped: the
 * test then has no variant and runs.
 *
 * Opening a store cleans it up: directories of other format versions go, and so do the tests
 * nothing recorded or matched in {@link STALE_TEST_MS}. Cleanup leaves a recent temporary file
 * alone, so it never removes a variant another worktree is writing.
 */
export class VariantStore {
    constructor(readonly dir: string) {}

    /** The store of `suite` in the git repository at `root`. */
    static async open(root: string, suite: string): Promise<VariantStore> {
        const commonDir = await new GitRepository(root).git([
            'rev-parse',
            '--path-format=absolute',
            '--git-common-dir',
        ]);
        return await VariantStore.openAt(path.join(commonDir, 'nzyme-affected'), suite);
    }

    /** The store of `suite` under `storeRoot` (the directory holding the `v<N>` directories), cleaned up. */
    static async openAt(storeRoot: string, suite: string): Promise<VariantStore> {
        const current = `v${STORE_VERSION}`;
        for (const entry of await listEntries(storeRoot)) {
            if (entry.isDirectory() && /^v\d+$/.test(entry.name) && entry.name !== current) {
                await removeTree(path.join(storeRoot, entry.name));
            }
        }

        const store = new VariantStore(path.join(storeRoot, current, suite));
        await store.removeStaleTests();
        return store;
    }

    /** The valid variants of a test, newest first. */
    async read(unit: TestUnit): Promise<StoredVariant[]> {
        const dir = this.unitDir(unit);
        const key = getTestUnitKey(unit);
        const variants: StoredVariant[] = [];

        for (const name of await listDir(dir)) {
            if (!name.endsWith('.json')) {
                continue;
            }
            const variant = parseVariant(await readOptional(path.join(dir, name)));
            if (variant && getTestUnitKey(variant.unit) === key) {
                variants.push({ id: name.slice(0, -'.json'.length), variant });
            }
        }

        return variants.toSorted((a, b) => (a.variant.recordedAt < b.variant.recordedAt ? 1 : -1));
    }

    /** Stores a variant (an identical one is replaced) and evicts the least recently matched beyond the limit. */
    async write(variant: Variant): Promise<StoredVariant> {
        const dir = this.unitDir(variant.unit);
        const id = getMd5Hash(JSON.stringify([variant.files, variant.suite.hash]));
        const file = path.join(dir, `${id}.json`);
        const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;

        const content = JSON.stringify({ version: STORE_VERSION, ...variant });
        await mkdir(dir, { recursive: true });
        try {
            await writeFile(tmp, content);
        } catch (error) {
            if (!isErrorCode(error, 'ENOENT')) {
                throw error;
            }
            // Cleanup in another worktree removed the directory just created; the temporary file now keeps it.
            await mkdir(dir, { recursive: true });
            await writeFile(tmp, content);
        }
        try {
            await rename(tmp, file);
        } catch (error) {
            await rm(tmp, { force: true });
            throw error;
        }

        await this.evict(dir);
        return { id, variant };
    }

    /** Marks a variant as just matched, which keeps it from eviction. */
    async touch(unit: TestUnit, id: string): Promise<void> {
        const now = new Date();
        await ignoreMissing(utimes(this.variantPath(unit, id), now, now));
    }

    /** Deletes a variant; one already gone is fine. */
    async remove(unit: TestUnit, id: string): Promise<void> {
        await ignoreMissing(unlink(this.variantPath(unit, id)));
    }

    /** Removes the directories of tests whose newest variant was last recorded or matched over {@link STALE_TEST_MS} ago. */
    private async removeStaleTests(): Promise<void> {
        for (const entry of await listEntries(this.dir)) {
            if (!entry.isDirectory()) {
                continue;
            }
            const dir = path.join(this.dir, entry.name);
            let newestMs = 0;
            for (const name of await listDir(dir)) {
                if (name.endsWith('.json')) {
                    newestMs = Math.max(newestMs, (await ignoreMissing(stat(path.join(dir, name))))?.mtimeMs ?? 0);
                }
            }
            if (Date.now() - newestMs > STALE_TEST_MS) {
                await removeTree(dir);
            }
        }
    }

    /** A file's mtime is the last time its variant was recorded or matched. */
    private async evict(dir: string): Promise<void> {
        const entries: { name: string; mtimeMs: number }[] = [];
        for (const name of await listDir(dir)) {
            if (name.endsWith('.json')) {
                const stats = await ignoreMissing(stat(path.join(dir, name)));
                if (stats) {
                    entries.push({ name, mtimeMs: stats.mtimeMs });
                }
            }
        }

        const oldest = entries.toSorted((a, b) => b.mtimeMs - a.mtimeMs).slice(MAX_VARIANTS_PER_TEST);
        for (const { name } of oldest) {
            await ignoreMissing(unlink(path.join(dir, name)));
        }
    }

    private unitDir(unit: TestUnit): string {
        return path.join(this.dir, getMd5Hash(getTestUnitKey(unit)));
    }

    private variantPath(unit: TestUnit, id: string): string {
        return path.join(this.unitDir(unit), `${id}.json`);
    }
}

/**
 * The identity of a test: its file and title path.
 * @__NO_SIDE_EFFECTS__
 */
export function getTestUnitKey(unit: TestUnit): string {
    return JSON.stringify([unit.file, ...(unit.title ?? [])]);
}

async function listDir(dir: string): Promise<string[]> {
    return (await ignoreMissing(readdir(dir))) ?? [];
}

async function listEntries(dir: string) {
    return (await ignoreMissing(readdir(dir, { withFileTypes: true }))) ?? [];
}

/**
 * Removes a directory tree, except temporary files younger than {@link TMP_GRACE_MS} (a writer may
 * be about to rename one into place) and the directories that hold them.
 */
async function removeTree(dir: string): Promise<void> {
    for (const entry of await listEntries(dir)) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            await removeTree(entryPath);
            continue;
        }
        if (entry.name.endsWith('.tmp')) {
            const stats = await ignoreMissing(stat(entryPath));
            if (!stats || Date.now() - stats.mtimeMs < TMP_GRACE_MS) {
                continue;
            }
        }
        await ignoreMissing(unlink(entryPath));
    }

    try {
        await rmdir(dir);
    } catch (error) {
        // Still holds a recent temporary file, or another process removed it first.
        if (!isErrorCode(error, 'ENOTEMPTY') && !isErrorCode(error, 'EEXIST') && !isErrorCode(error, 'ENOENT')) {
            throw error;
        }
    }
}

async function readOptional(file: string): Promise<string | undefined> {
    return await ignoreMissing(readFile(file, 'utf8'));
}

/** Resolves to `undefined` when the file is gone — another worktree may evict it at any moment. */
async function ignoreMissing<T>(promise: Promise<T>): Promise<T | undefined> {
    try {
        return await promise;
    } catch (error) {
        if (isErrorCode(error, 'ENOENT')) {
            return undefined;
        }
        throw error;
    }
}

/** A stored variant, or `undefined` for anything that is not one of the current version. */
function parseVariant(content: string | undefined): Variant | undefined {
    if (content === undefined) {
        return undefined;
    }

    let value: unknown;
    try {
        value = JSON.parse(content);
    } catch {
        return undefined;
    }

    if (
        !isPlainObject(value) ||
        value.version !== STORE_VERSION ||
        !isTestUnit(value.unit) ||
        !isRecordOf(value.files, isFileHash) ||
        !isSuiteFingerprint(value.suite) ||
        typeof value.recordedAt !== 'string'
    ) {
        return undefined;
    }

    return { unit: value.unit, files: value.files, suite: value.suite, recordedAt: value.recordedAt };
}

function isTestUnit(value: unknown): value is TestUnit {
    return (
        isPlainObject(value) &&
        typeof value.file === 'string' &&
        (value.title === undefined || (Array.isArray(value.title) && value.title.every(isString)))
    );
}

function isSuiteFingerprint(value: unknown): value is SuiteFingerprint {
    return (
        isPlainObject(value) &&
        typeof value.hash === 'string' &&
        typeof value.config === 'string' &&
        isRecordOf(value.inputs, isSuiteInput)
    );
}

function isSuiteInput(value: unknown): value is SuiteInput {
    return isPlainObject(value) && isSuiteInputRole(value.role) && isFileHash(value.hash);
}

function isSuiteInputRole(value: unknown): value is SuiteInputRole {
    return value === 'trigger' || value === 'startup' || value === 'side-effect' || value === 'dynamic-import';
}

function isFileHash(value: unknown): value is FileHash {
    if (typeof value === 'string') {
        return true;
    }
    return isPlainObject(value) && typeof value.top === 'string' && (value.body === undefined || isString(value.body));
}

function isRecordOf<T>(value: unknown, isItem: (item: unknown) => item is T): value is Record<string, T> {
    return isPlainObject(value) && Object.values(value).every(item => isItem(item));
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}
