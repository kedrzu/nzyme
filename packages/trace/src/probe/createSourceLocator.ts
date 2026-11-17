import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

/** Parameters of {@link createSourceLocator}. */
export interface CreateSourceLocatorParams {
    /** Absolute path of the JavaScript file. */
    file: string;
    code: string;
    /** Absolute project root. */
    root: string;
}

/** The original sources of one JavaScript file, from {@link createSourceLocator}. */
export interface SourceLocator {
    /**
     * The source file the code at `offset` (UTF-16) was compiled from, as a root-relative POSIX path;
     * `undefined` for code from outside the root, from `node_modules`, or generated with no source
     * (a bundler's helper or a virtual module).
     */
    sourceAt: (offset: number) => string | undefined;
    /** Every traced source the file was compiled from (root-relative), whether it ran or not. */
    sources: string[];
    /**
     * Those of `sources` the build does not reflect: the source, or a built file on the way to it,
     * was modified after the file compiled from it. Modification times are a sound signal because
     * every build in scope rewrites its output on any input change (`tsgo --build` even on a
     * type-only one). A missing file on the way is skipped: it is a virtual module, or a deleted file
     * the variant check reports by itself.
     */
    findStale: (sources: Iterable<string>) => string[];
}

/**
 * Maps offsets in a JavaScript file to the original source files it was compiled from, through the
 * file's source map (`//# sourceMappingURL=`, a sibling file or a data URL). A file with no source
 * map is its own source.
 *
 * A source that is itself a compiled JavaScript file with a single-source map (a bundle of a
 * workspace package's `dist`, built by tsc) resolves on to that one source, so a bundle maps to the
 * package's `src`, not its build output.
 * @__NO_SIDE_EFFECTS__
 */
export function createSourceLocator(params: CreateSourceLocatorParams): SourceLocator {
    const { file, code, root } = params;
    /** The built files between this file and each source compiled through them, outermost first. */
    const buildChains = new Map<string, string[]>();
    const followed = new Map<string, string>();
    const loaded = loadSourceMap(file, code);
    if (loaded === undefined) {
        const own = toTracedPath(file, root);
        return { sourceAt: () => own, sources: own === undefined ? [] : [own], findStale: () => [] };
    }
    const map: TraceMap = loaded;

    const sources = new Set<string>();
    for (const source of map.resolvedSources) {
        const traced = toTracedPath(source, root);
        if (traced !== undefined) {
            sources.add(followBuild(traced));
        }
    }

    // A single-source map (tsc output) attributes even unmapped positions to its one source.
    const single = map.resolvedSources.length === 1 ? map.resolvedSources[0] : undefined;
    const singleTraced = single == null ? undefined : toTracedPath(single, root);
    const singlePath = singleTraced === undefined ? undefined : followBuild(singleTraced);
    const lineStarts = getLineStarts(code);

    return { sourceAt, sources: [...sources], findStale };

    function sourceAt(offset: number) {
        const { line, start } = findLine(lineStarts, offset);
        const position = originalPositionFor(map, { line: line + 1, column: offset - start });
        if (position.source === null) {
            return singlePath;
        }
        const traced = toTracedPath(position.source, root);
        return traced === undefined ? undefined : followBuild(traced);
    }

    function findStale(candidates: Iterable<string>) {
        const stale: string[] = [];
        for (const source of candidates) {
            const files = [file, ...(buildChains.get(source) ?? []), path.join(root, source)];
            const mtimes = files.map(each => statSync(each, { throwIfNoEntry: false })?.mtimeMs);
            for (let i = 1; i < mtimes.length; i++) {
                const built = mtimes[i - 1];
                const input = mtimes[i];
                if (built != null && input != null && input > built) {
                    stale.push(source);
                    break;
                }
            }
        }
        return stale;
    }

    /** The source a traced path was compiled from, through built JavaScript with a single-source map. */
    function followBuild(traced: string): string {
        const known = followed.get(traced);
        if (known !== undefined) {
            return known;
        }

        let current = traced;
        const chain: string[] = [];
        while (/\.[cm]?js$/.test(current) && chain.length < MAX_BUILD_CHAIN) {
            const builtFile = path.join(root, current);
            if (!existsSync(builtFile)) {
                break;
            }
            const builtMap = loadSourceMap(builtFile, readFileSync(builtFile, 'utf8'));
            const only = builtMap?.resolvedSources.length === 1 ? builtMap.resolvedSources[0] : undefined;
            const next = only == null ? undefined : toTracedPath(only, root);
            if (next === undefined || next === current) {
                break;
            }
            chain.push(builtFile);
            current = next;
        }

        followed.set(traced, current);
        if (chain.length > 0 && !buildChains.has(current)) {
            buildChains.set(current, chain);
        }
        return current;
    }
}

/** How many built files deep a source is followed; deeper is a loop of maps, not a real build. */
const MAX_BUILD_CHAIN = 4;

function loadSourceMap(file: string, code: string) {
    const url = /\/\/# sourceMappingURL=(?<url>\S+)\s*$/.exec(code)?.groups?.url;
    if (url === undefined) {
        return undefined;
    }

    const inline = /^data:application\/json[^,]*?(?<base64>;base64)?,(?<data>.*)$/.exec(url)?.groups;
    if (inline !== undefined) {
        const data = inline.data ?? '';
        const json = inline.base64 ? Buffer.from(data, 'base64').toString('utf8') : decodeURIComponent(data);
        return new TraceMap(json, file);
    }

    const mapPath = path.resolve(path.dirname(file), url);
    if (!existsSync(mapPath)) {
        return undefined;
    }
    return new TraceMap(readFileSync(mapPath, 'utf8'), mapPath);
}

function toTracedPath(source: string, root: string) {
    const absolute = path.resolve(source.startsWith('file:') ? fileURLToPath(source) : source);
    const relative = path.relative(root, absolute);
    const segments = relative.split(path.sep);
    if (
        segments[0] === '..' ||
        path.isAbsolute(relative) ||
        segments.includes('node_modules') ||
        // A virtual module (`virtual:nuxt:…`, rollup's `\0commonjsHelpers`) has no file behind it.
        segments.some(segment => segment.includes(':') || segment.includes('\0'))
    ) {
        return undefined;
    }
    return segments.join('/');
}

function getLineStarts(code: string) {
    const starts = [0];
    for (let i = 0; i < code.length; i++) {
        if (code.codePointAt(i) === 10) {
            starts.push(i + 1);
        }
    }
    return starts;
}

/** The 0-based line containing `offset` and the offset it starts at. */
function findLine(lineStarts: number[], offset: number) {
    let line = 0;
    let start = 0;
    let high = lineStarts.length - 1;
    while (line < high) {
        const middle = (line + high + 1) >> 1;
        const middleStart = lineStarts[middle] ?? Infinity;
        if (middleStart <= offset) {
            line = middle;
            start = middleStart;
        } else {
            high = middle - 1;
        }
    }
    return { line, start };
}
