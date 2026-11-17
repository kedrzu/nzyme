import path from 'node:path';

import fs from 'fs-extra';
import parseGitignore from 'parse-gitignore';

import { createCache } from '@nzyme/utils/createCache.js';

import { getProjectRoot } from './getProjectRoot.js';

interface CompiledPattern {
    regex: RegExp;
    /** `!pattern` - re-includes what an earlier pattern ignored. */
    negated: boolean;
    /** `pattern/` - matches directories only. */
    directoryOnly: boolean;
}

/** A directory to check, with the git root its `.gitignore` files are read up to. */
interface DirectoryInRepo {
    dir: string;
    gitRoot: string;
}

// Cache of gitignore patterns per directory
const directoryCache = createCache({ getValue: loadPatternsForDirectory });

// Cache of whether a directory is ignored (itself or through an ancestor)
const directoryIgnoredCache = createCache({
    cacheKey: ({ dir }: DirectoryInRepo) => dir,
    getValue: ({ dir, gitRoot }: DirectoryInRepo) =>
        isDirectoryIgnored(path.dirname(dir), gitRoot) || matchesGitignore(dir, true, gitRoot),
});

// Cache of git roots per directory
const gitRootCache = createCache({ getValue: findGitRoot });
const projectRoot = getProjectRoot();
const commonIgnorePaths: readonly string[] = ['.git', '.turbo', '.nx', '.yarn', 'node_modules'];

/**
 * Checks if a file or directory path should be ignored by the file system watcher.
 *
 * This function evaluates paths against gitignore patterns and common ignore paths
 * (like node_modules, .git, etc.) to determine if they should be watched by chokidar.
 *
 * The return value is intentionally tri-state to handle directories properly:
 * - `true` means the path is explicitly ignored and should be skipped entirely
 * - `false` means it's a file that should be watched
 * - `undefined` means it's a directory that's not ignored - chokidar should traverse
 *   into it to find watchable files, but the directory itself isn't explicitly watched
 *
 * Returning `undefined` for non-ignored directories is crucial because gitignore
 * patterns work at the file level - a directory might not be ignored, but it could
 * contain files that are. We need to let chokidar traverse into these directories
 * to properly evaluate their contents.
 *
 * @param file - The file or directory path to check (absolute path)
 * @returns `true` if explicitly ignored, `false` if file (not ignored), `undefined` if directory (not ignored)
 */
export function isFileIgnored(file: string): boolean | undefined {
    // Always ignore common ignore paths
    if (
        commonIgnorePaths.some(ignorePath => file.endsWith(`/${ignorePath}`)) ||
        commonIgnorePaths.some(ignorePath => file.includes(`/.${ignorePath}/`))
    ) {
        return true;
    }

    const fileDir = path.dirname(file);

    // Find git root for this file (handles submodules)
    const gitRoot = gitRootCache.get(fileDir);

    // Git cannot re-include a file whose parent directory is excluded
    if (isDirectoryIgnored(fileDir, gitRoot)) {
        return true;
    }

    const isDirectory = isDirectoryOnDisk(file);

    if (matchesGitignore(file, isDirectory === true, gitRoot)) {
        return true;
    }

    // Not ignored - a directory returns undefined so chokidar can traverse into it
    // (also when it can't be stat'ed, e.g. doesn't exist yet)
    return isDirectory === false ? false : undefined;
}

/**
 * Whether the directory is ignored, directly or through any of its ancestors up to the git root.
 */
function isDirectoryIgnored(dir: string, gitRoot: string): boolean {
    if (dir === gitRoot || !isInside(gitRoot, dir)) {
        return false;
    }

    return directoryIgnoredCache.get({ dir, gitRoot });
}

/**
 * Evaluates the `.gitignore` files from the nearest one upwards. On a level the last matching
 * pattern decides (a negation re-includes); with no match the next level up decides.
 * Does not look at ancestors of `target` - see `isDirectoryIgnored`.
 */
function matchesGitignore(target: string, isDirectory: boolean, gitRoot: string): boolean {
    let currentDir = path.dirname(target);

    while (true) {
        const patterns = directoryCache.get(currentDir);

        if (patterns.length > 0) {
            const relativeFromDir = path.relative(currentDir, target).replaceAll('\\', '/');

            for (let i = patterns.length - 1; i >= 0; i--) {
                const pattern = patterns[i];
                if (pattern && (isDirectory || !pattern.directoryOnly) && pattern.regex.test(relativeFromDir)) {
                    return !pattern.negated;
                }
            }
        }

        if (currentDir === gitRoot || currentDir === projectRoot) {
            return false;
        }

        const parentDir = path.dirname(currentDir);
        // Stop if we can't go higher or reached filesystem root
        if (parentDir === currentDir) {
            return false;
        }

        currentDir = parentDir;
    }
}

function isInside(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * `undefined` when the path can't be stat'ed.
 */
function isDirectoryOnDisk(target: string): boolean | undefined {
    try {
        return fs.statSync(target).isDirectory();
    } catch {
        return undefined;
    }
}

/**
 * Clears the gitignore cache. Useful for testing or when gitignore files change.
 */
export function clearIgnoreCache(): void {
    directoryCache.clear();
    directoryIgnoredCache.clear();
    gitRootCache.clear();
}

/**
 * Finds the git root by looking for .git directory, starting from the given directory.
 *
 * @param startDir - The directory to start searching from
 */
function findGitRoot(startDir: string): string {
    let currentDir = startDir;

    while (true) {
        const gitPath = path.join(currentDir, '.git');
        if (fs.existsSync(gitPath)) {
            return currentDir;
        }

        const parentDir = path.dirname(currentDir);
        // Stop if we can't go higher or reached filesystem root
        if (parentDir === currentDir) {
            // No .git found, use the original start directory
            return startDir;
        }

        currentDir = parentDir;
    }
}

/**
 * Loads and compiles the patterns of a directory's `.gitignore`; none when it has no such file.
 */
function loadPatternsForDirectory(dir: string): CompiledPattern[] {
    // Load .gitignore from this directory
    const gitignorePath = path.join(dir, '.gitignore');
    const patterns: string[] = [];

    if (fs.existsSync(gitignorePath)) {
        try {
            const content = fs.readFileSync(gitignorePath, 'utf-8');
            const parsed = parseGitignore.parse(content);
            patterns.push(...parsed.patterns);
        } catch {
            // Ignore read errors
        }
    }

    return compilePatterns(patterns);
}

/**
 * Compiles gitignore patterns to regular expressions matched against the path relative to the
 * `.gitignore` directory. A pattern matches the path itself only - paths below an ignored
 * directory are handled by the ancestor check.
 */
function compilePatterns(patterns: string[]): CompiledPattern[] {
    const compiled: CompiledPattern[] = [];

    for (const raw of patterns) {
        let pattern = raw;

        const negated = pattern.startsWith('!');
        if (negated) {
            pattern = pattern.slice(1);
        } else if (pattern.startsWith('\\!') || pattern.startsWith('\\#')) {
            pattern = pattern.slice(1);
        }

        const directoryOnly = pattern.endsWith('/');
        if (directoryOnly) {
            pattern = pattern.slice(0, -1);
        }

        // A slash anywhere but the end anchors the pattern to the .gitignore directory
        const anchored = pattern.includes('/');
        if (pattern.startsWith('/')) {
            pattern = pattern.slice(1);
        }

        if (pattern === '') {
            continue;
        }

        const segments = pattern.split('/');
        let body = '';
        for (const [index, segment] of segments.entries()) {
            const last = index === segments.length - 1;
            if (segment === '**') {
                body += last ? '.+' : '(?:.*/)?';
            } else {
                body += translateSegment(segment) + (last ? '' : '/');
            }
        }

        try {
            compiled.push({
                regex: new RegExp((anchored ? '^' : '(?:^|/)') + body + '$'),
                negated,
                directoryOnly,
            });
        } catch {
            // Skip invalid patterns
        }
    }

    return compiled;
}

/**
 * Translates one path segment of a gitignore pattern (`*`, `?`, `[...]`, `\x`) to regex source.
 */
function translateSegment(segment: string): string {
    let out = '';
    for (let i = 0; i < segment.length; i++) {
        const char = segment.charAt(i);
        if (char === '*') {
            out += '[^/]*';
        } else if (char === '?') {
            out += '[^/]';
        } else if (char === '[') {
            const end = segment.indexOf(']', i + 2);
            if (end === -1) {
                out += '\\[';
            } else {
                const content = segment.slice(i + 1, end);
                out += `[${content.startsWith('!') ? '^' + content.slice(1) : content}]`;
                i = end;
            }
        } else if (char === '\\' && i + 1 < segment.length) {
            i++;
            out += escapeRegex(segment.charAt(i));
        } else {
            out += escapeRegex(char);
        }
    }
    return out;
}

function escapeRegex(char: string): string {
    return char.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');
}
