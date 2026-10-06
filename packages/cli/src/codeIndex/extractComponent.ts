import type { IndexSymbol } from './IndexSymbol.js';

/** Inputs for {@link extractComponent}. */
export interface ExtractComponentOptions {
    /** Owning workspace package name, e.g. '@acme/ui'. */
    packageName: string;
    /** Repo-relative declaring file path, for {@link IndexSymbol.relPath}. */
    relPath: string;
    /** Deep import specifier for this file, from `importPathOf` (`.vue` preserved). */
    importPath: string;
    /** The `.vue` file's base name, e.g. 'InfoBox.vue' — the export name is this minus `.vue`. */
    fileName: string;
    /** Raw file contents. */
    content: string;
}

/** Matches a leading `<!-- ... -->` HTML comment anchored at the very top of the file. */
const LEADING_COMMENT = /^\s*<!--([\s\S]*?)-->/;

/**
 * Extracts the single `IndexSymbol` for a `.vue` single-file component. The export name is the
 * file name without its `.vue` extension. The description is the text of a leading HTML comment
 * (`<!-- ... -->`) that appears at the very top of the file, before any `<script>`/`<template>`
 * block — collapsed to one line — or null when the file opens directly with a block. Comments
 * inside `<template>` are ignored because the match is anchored to the start of the file.
 *
 * Regex-only (no Vue/HTML parse) — always returns exactly one symbol and never throws.
 * @__NO_SIDE_EFFECTS__
 */
export function extractComponent(options: ExtractComponentOptions): IndexSymbol[] {
    const { packageName, relPath, importPath, fileName, content } = options;

    return [
        {
            kind: 'component',
            packageName,
            exportName: fileName.replace(/\.vue$/, ''),
            importPath,
            internalName: null,
            description: leadingComment(content),
            signature: null,
            relPath,
        },
    ];
}

/** Returns the collapsed text of a top-of-file HTML comment, or null when there is none. */
function leadingComment(content: string): string | null {
    const match = LEADING_COMMENT.exec(content);
    const inner = match?.[1];
    if (!inner) {
        return null;
    }

    const text = inner.replace(/\s+/g, ' ').trim();
    return text || null;
}
