import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { TraceMap } from '@jridgewell/trace-mapping';
import { createXXHash128 } from 'hash-wasm';

import { toSourcePath } from './toSourcePath.js';

/** Parameters of {@link BuildChecker.isCurrent}. */
export interface IsBuildCurrentParams {
    /** Absolute path of the built JavaScript file. */
    builtFile: string;
    /** Its source map, when it has one. */
    map: TraceMap | undefined;
    /** Absolute path of an input it was built from. */
    input: string;
}

/** Tells whether built files reflect their inputs as they are on disk now. */
export interface BuildChecker {
    /**
     * Whether `builtFile` was built from the current content of `input`: the content its source map
     * embeds (`sourcesContent`, as Vite and rollup write it) equals the file, or else the TypeScript
     * build info covering `input` records the XXH3-128 of the file's text (what `tsgo` stores as a
     * file's version). With neither, the build cannot be shown current, so it is not. An input that
     * is not code (an image, an SVG) and does not match embedded content is current while it is not
     * newer than `builtFile`. A missing `input` is current: a virtual module, or a deleted file the
     * variant check reports by itself.
     */
    isCurrent: (params: IsBuildCurrentParams) => boolean;
}

/** An input whose build output embeds its text, or that a TypeScript build info covers. */
const CODE_SOURCE = /\.(?:[cm]?[jt]sx?|vue)$/;

/**
 * Creates a checker of build freshness by content, not modification time — a checkout or a build
 * cache restore changes times without changing what was built — except for assets (see `isCurrent`). Files and build infos are read once
 * per checker, so create one per process.
 */
export async function createBuildChecker(root: string): Promise<BuildChecker> {
    const hasher = await createXXHash128();
    const texts = new Map<string, string | null>();
    const textHashes = new Map<string, string>();
    const buildInfosInDir = new Map<string, string[]>();
    const buildInfos = new Map<string, BuildInfoVersions>();
    const results = new Map<string, boolean>();

    return { isCurrent };

    function isCurrent(params: IsBuildCurrentParams): boolean {
        const key = `${params.builtFile}\0${params.input}`;
        let current = results.get(key);
        if (current === undefined) {
            current = checkCurrent(params);
            results.set(key, current);
        }
        return current;
    }

    function checkCurrent({ builtFile, map, input }: IsBuildCurrentParams): boolean {
        const text = readText(input);
        if (text === null) {
            return true;
        }

        let embedded = false;
        for (const [index, source] of map?.resolvedSources.entries() ?? []) {
            const content = map?.sourcesContent?.[index];
            if (content == null || toSourcePath(source) !== input) {
                continue;
            }
            if (content === text) {
                return true;
            }
            embedded = true;
        }
        if (!CODE_SOURCE.test(input)) {
            // A bundler embeds what it generated from an asset (`export default "data:…"`, a
            // component built from an SVG), never the asset itself, and no build info covers one:
            // only its modification time is left to compare.
            return (statSync(input, { throwIfNoEntry: false })?.mtimeMs ?? Infinity) <= statSync(builtFile).mtimeMs;
        }
        if (embedded) {
            return false;
        }

        const version = findBuildInfoVersion(path.dirname(builtFile), input);
        return version !== undefined && version === hashText(input, text);
    }

    function readText(file: string): string | null {
        let text = texts.get(file);
        if (text === undefined) {
            try {
                text = readFileSync(file, 'utf8');
            } catch {
                text = null;
            }
            texts.set(file, text);
        }
        return text;
    }

    function hashText(file: string, text: string): string {
        let hash = textHashes.get(file);
        if (hash === undefined) {
            hasher.init();
            hasher.update(text);
            hash = hasher.digest('hex');
            textHashes.set(file, hash);
        }
        return hash;
    }

    /** The version a build info in `dir` or above (up to the root) records for `input`. */
    function findBuildInfoVersion(dir: string, input: string): string | undefined {
        for (let current = dir; ; current = path.dirname(current)) {
            for (const buildInfo of listBuildInfos(current)) {
                const version = readBuildInfo(buildInfo).get(input);
                if (version !== undefined) {
                    return version;
                }
            }
            if (current === root || path.dirname(current) === current || !current.startsWith(root)) {
                return undefined;
            }
        }
    }

    function listBuildInfos(dir: string): string[] {
        let files = buildInfosInDir.get(dir);
        if (!files) {
            try {
                files = readdirSync(dir)
                    .filter(name => name.endsWith('.tsbuildinfo'))
                    .map(name => path.join(dir, name));
            } catch {
                files = [];
            }
            buildInfosInDir.set(dir, files);
        }
        return files;
    }

    function readBuildInfo(file: string): BuildInfoVersions {
        let versions = buildInfos.get(file);
        if (!versions) {
            versions = parseBuildInfo(file);
            buildInfos.set(file, versions);
        }
        return versions;
    }
}

/** Source versions of a build info, by absolute path; also by lower-cased path, as tsgo writes on a case-insensitive file system. */
interface BuildInfoVersions {
    get(file: string): string | undefined;
}

function parseBuildInfo(file: string): BuildInfoVersions {
    const exact = new Map<string, string>();
    const folded = new Map<string, string>();
    try {
        const info: unknown = JSON.parse(readFileSync(file, 'utf8'));
        const fileNames = getArray(info, 'fileNames');
        const fileInfos = getArray(info, 'fileInfos');
        for (const [index, name] of fileNames.entries()) {
            const version = getVersion(fileInfos[index]);
            if (typeof name === 'string' && version !== undefined) {
                const absolute = path.resolve(path.dirname(file), name);
                exact.set(absolute, version);
                folded.set(absolute.toLowerCase(), version);
            }
        }
    } catch {
        // An unreadable build info shows nothing current.
    }
    return { get: input => exact.get(input) ?? folded.get(input.toLowerCase()) };
}

function getArray(value: unknown, key: string): unknown[] {
    if (typeof value === 'object' && value !== null && key in value) {
        const field: unknown = Reflect.get(value, key);
        return Array.isArray(field) ? field : [];
    }
    return [];
}

/** A `fileInfos` entry: the version string, or an object holding it. */
function getVersion(fileInfo: unknown): string | undefined {
    if (typeof fileInfo === 'string') {
        return fileInfo;
    }
    if (typeof fileInfo === 'object' && fileInfo !== null && 'version' in fileInfo) {
        const version: unknown = fileInfo.version;
        return typeof version === 'string' ? version : undefined;
    }
    return undefined;
}
