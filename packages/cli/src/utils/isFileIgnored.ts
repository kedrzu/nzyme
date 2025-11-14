import path from 'path';

import fs from 'fs-extra';
import parseGitignore from 'parse-gitignore';

import { getProjectRoot } from '@nzyme/project-utils';

// Cache of gitignore patterns per directory
const directoryCache = new Map<string, RegExp[]>();

// Cache of git roots per directory
const gitRootCache = new Map<string, string>();

const projectRoot = getProjectRoot();

/**
 * Checks if a file is ignored by the file system watcher.
 *
 * @param file - The file path to check (absolute path)
 */
export function isFileIgnored(file: string): boolean | undefined {
    // Always ignore .git directories
    if (file.includes('/.git/') || file.endsWith('/.git')) {
        return true;
    }

    const fileDir = path.dirname(file);

    // Find git root for this file (handles submodules)
    const gitRoot = findGitRoot(fileDir);

    // Walk up from file's directory to git root, checking .gitignore files
    let currentDir = fileDir;

    while (true) {
        const patterns = getCachedPatternsForDirectory(currentDir);

        if (patterns.length > 0) {
            // Get relative path from this directory (where .gitignore lives)
            const relativeFromDir = path.relative(currentDir, file).replaceAll('\\', '/');

            // Check if file matches any pattern
            for (const regex of patterns) {
                if (regex.test(relativeFromDir)) {
                    return true;
                }
            }
        }

        // Stop if we've reached the git root
        if (currentDir === gitRoot) {
            break;
        }

        if (currentDir === projectRoot) {
            break;
        }

        const parentDir = path.dirname(currentDir);
        // Stop if we can't go higher or reached filesystem root
        if (parentDir === currentDir) {
            break;
        }

        currentDir = parentDir;
    }

    return false;
}

/**
 * Clears the gitignore cache. Useful for testing or when gitignore files change.
 */
export function clearIgnoreCache(): void {
    directoryCache.clear();
    gitRootCache.clear();
}

/**
 * Finds the git root by looking for .git directory, starting from the given directory.
 *
 * @param startDir - The directory to start searching from
 */
function findGitRoot(startDir: string): string {
    const cached = gitRootCache.get(startDir);
    if (cached) {
        return cached;
    }

    let currentDir = startDir;

    while (true) {
        const gitPath = path.join(currentDir, '.git');
        if (fs.existsSync(gitPath)) {
            gitRootCache.set(startDir, currentDir);
            return currentDir;
        }

        const parentDir = path.dirname(currentDir);
        // Stop if we can't go higher or reached filesystem root
        if (parentDir === currentDir) {
            // No .git found, use the original start directory
            gitRootCache.set(startDir, startDir);
            return startDir;
        }

        currentDir = parentDir;
    }
}

/**
 * Gets cached patterns for a directory, loading from .gitignore if not cached.
 */
function getCachedPatternsForDirectory(dir: string): RegExp[] {
    const cached = directoryCache.get(dir);
    if (cached) {
        return cached;
    }

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

    // Compile patterns to regexes (filter out invalid ones)
    const compiledPatterns = compilePatterns(patterns);

    directoryCache.set(dir, compiledPatterns);
    return compiledPatterns;
}

/**
 * Compiles gitignore patterns to regular expressions.
 */
function compilePatterns(patterns: string[]): RegExp[] {
    const compiled: RegExp[] = [];

    for (const pattern of patterns) {
        // Convert gitignore pattern to regex
        let regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*/g, '@@DOUBLE_STAR@@')
            .replace(/\*/g, '[^/]*')
            .replace(/@@DOUBLE_STAR@@/g, '.*')
            .replace(/\?/g, '[^/]');

        // Handle leading slash (absolute path from root)
        if (regexPattern.startsWith('/')) {
            regexPattern = '^' + regexPattern.slice(1);
        } else {
            // Pattern can match anywhere in the path
            regexPattern = '(^|/)' + regexPattern;
        }

        // Handle trailing slash (directory only)
        if (regexPattern.endsWith('/')) {
            regexPattern = regexPattern.slice(0, -1) + '($|/)';
        } else {
            regexPattern = regexPattern + '($|/)';
        }

        try {
            compiled.push(new RegExp(regexPattern));
        } catch {
            // Skip invalid patterns
        }
    }

    return compiled;
}
