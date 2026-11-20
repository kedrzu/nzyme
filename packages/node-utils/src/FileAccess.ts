// The local-file allowlist of the agent CLIs: which paths a command may read or write.
//
// One module, so the checks (roots, secret files, path input) change together and only the two entry
// points and the shape are public.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Where a command may read or write local files: every path must resolve, symlinks followed, inside
 * one of `roots`. Used by the agent CLIs so a file outside the allowed directories never reaches an
 * external service, and a download never lands outside them.
 */
export interface FileAccess {
    /** Relative paths resolve here. */
    baseDir: string;
    /** Files must live under one of these. */
    roots: string[];
}

/** Options of {@link assertFileAccess}. */
export interface AssertFileAccessOptions {
    /** The path with symlinks already resolved. */
    real: string;
    /** The path as the user gave it, trimmed: refused when empty or starting with `~`, and shown in errors. */
    shown: string;
    access: FileAccess;
    verb: 'read' | 'write';
}

/**
 * The real path of a regular file a command may read: resolved against `access.baseDir` with symlinks
 * followed, inside the access roots, and not a secrets file. Throws a message naming the path otherwise.
 * @util
 */
export async function resolveReadableFile(input: string, access: FileAccess): Promise<string> {
    const shown = checkPathInput(input);
    let real: string;
    try {
        real = await fs.realpath(path.resolve(access.baseDir, shown));
    } catch {
        throw new Error(`File not found: ${shown}`);
    }

    await assertFileAccess({ real, shown, access, verb: 'read' });
    const stat = await fs.stat(real);
    if (!stat.isFile()) {
        throw new Error(`'${shown}' is not a regular file`);
    }

    return real;
}

/**
 * Throws unless the path as given is usable (not empty, not starting with `~`) and its resolved form
 * lies inside one of the access roots (themselves resolved, so a root reached through a symlink still
 * counts) and is not a secrets file.
 * @util
 */
export async function assertFileAccess({ real, shown, access, verb }: AssertFileAccessOptions): Promise<void> {
    checkPathInput(shown);
    const roots = await Promise.all(access.roots.map(root => fs.realpath(root).catch(() => null)));
    if (!roots.some(root => root !== null && isInside(real, root))) {
        throw new Error(
            `'${shown}' is outside the directories this command may ${verb} (${access.roots.join(', ')}). ` +
                'Use a path inside the project directory.',
        );
    }

    if (isSecretFile(real)) {
        throw new Error(`'${shown}' looks like a secrets file - refusing to ${verb} it`);
    }
}

/**
 * Trims a path given on the command line and refuses an empty one or one starting with `~`, which a
 * shell would have expanded: a literal `~` means the caller quoted it, and guessing would be wrong.
 */
function checkPathInput(input: string): string {
    const p = input.trim();
    if (!p) {
        throw new Error('Empty file path');
    }

    if (p.startsWith('~')) {
        throw new Error(`'${p}': use an absolute path instead of ~`);
    }

    return p;
}

/**
 * Whether a file name looks like a secrets file — `.env*`, an OAuth client file (`client_secret*.json`),
 * `credentials.json`, `token(s).json` or their `*-` prefixed forms — which an agent command must never
 * upload, attach or overwrite, even inside an allowed directory.
 */
function isSecretFile(filePath: string): boolean {
    const name = path.basename(filePath).toLowerCase();
    return (
        name.startsWith('.env') ||
        /^client_secret.*\.json$/.test(name) ||
        /(^|-)(credentials|tokens?)\.json$/.test(name)
    );
}

function isInside(filePath: string, root: string) {
    const rel = path.relative(root, filePath);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
