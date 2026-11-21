import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { TraceMap } from '@jridgewell/trace-mapping';

import { createBuildInfoReader } from '@nzyme/affected/build/createBuildInfoReader.js';

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
    const buildInfos = await createBuildInfoReader();
    const texts = new Map<string, string | null>();
    const textHashes = new Map<string, string>();
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

        const versions = findBuildInfoVersions(path.dirname(builtFile), input);
        return versions.includes(hashText(input, text));
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
            hash = buildInfos.hashText(text);
            textHashes.set(file, hash);
        }
        return hash;
    }

    /** The versions the build infos of the nearest directory at or above `dir` (up to the root) listing `input` record for it. */
    function findBuildInfoVersions(dir: string, input: string): string[] {
        for (let current = dir; ; current = path.dirname(current)) {
            const versions = buildInfos.readVersions(current, input);
            if (versions.length > 0) {
                return versions;
            }
            if (current === root || path.dirname(current) === current || !current.startsWith(root)) {
                return [];
            }
        }
    }
}
