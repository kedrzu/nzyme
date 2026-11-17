import { existsSync, readFileSync } from 'node:fs';
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

/**
 * Maps an offset in a JavaScript file to the original source file it was compiled from, through the
 * file's source map (`//# sourceMappingURL=`, a sibling file or a data URL). Returns the root-relative
 * POSIX path, or `undefined` for code from outside the root, from `node_modules`, or generated with
 * no source (a bundler's helper). A file with no source map is its own source.
 * @__NO_SIDE_EFFECTS__
 */
export function createSourceLocator(params: CreateSourceLocatorParams): (offset: number) => string | undefined {
    const { file, code, root } = params;
    const map = loadSourceMap(file, code);
    if (map === undefined) {
        const own = toTracedPath(file, root);
        return () => own;
    }

    // A single-source map (tsc output) attributes even unmapped positions to its one source.
    const single = map.resolvedSources.length === 1 ? map.resolvedSources[0] : undefined;
    const singlePath = single == null ? undefined : toTracedPath(single, root);
    const lineStarts = getLineStarts(code);

    return offset => {
        const { line, start } = findLine(lineStarts, offset);
        const position = originalPositionFor(map, { line: line + 1, column: offset - start });
        if (position.source === null) {
            return singlePath;
        }
        return toTracedPath(position.source, root);
    };
}

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
    if (segments[0] === '..' || path.isAbsolute(relative) || segments.includes('node_modules')) {
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
