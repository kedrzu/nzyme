import { getMd5Hash } from '@nzyme/crypto';

import type { FileFingerprint } from './FileFingerprint.js';
import { normalizeWhitespace } from './normalizeWhitespace.js';

/** Style languages where `//` starts a comment running to the end of the line. */
const LINE_COMMENT_LANGS: ReadonlySet<string> = new Set(['scss', 'sass', 'less']);

/**
 * Fingerprints a stylesheet. It has no load-time/call-time split, so `body` and `top` are the same
 * hash: whatever level a variant stores the file at, any change outside comments and formatting
 * changes the hash it compares.
 * @__NO_SIDE_EFFECTS__
 */
export function fingerprintStyle(content: string, lang: string): FileFingerprint {
    const hash = getMd5Hash(normalizeStyle(content, lang));
    return { body: hash, top: hash };
}

/**
 * A stylesheet with its comments removed and whitespace normalised. `/* … *\/` is a comment in every
 * language; `// …` only in SCSS, Sass and Less (`lang`, `undefined` meaning plain CSS). Comment
 * markers inside strings and inside an unquoted `url(…)` are content.
 * @__NO_SIDE_EFFECTS__
 */
export function normalizeStyle(content: string, lang: string | undefined) {
    return normalizeWhitespace(stripStyleComments(content, LINE_COMMENT_LANGS.has(lang ?? 'css')));
}

function stripStyleComments(css: string, lineComments: boolean) {
    let code = '';
    /** Start of the text not yet copied to `code`. */
    let kept = 0;
    let i = 0;
    while (i < css.length) {
        const char = css[i];
        const next = css[i + 1];
        if (char === '"' || char === "'") {
            i = skipString(css, i);
        } else if (char === '/' && next === '*') {
            const end = css.indexOf('*/', i + 2);
            if (end === -1) {
                // Unterminated: keep the rest as code rather than drop what may be declarations.
                break;
            }
            code += css.slice(kept, i) + ' ';
            i = kept = end + 2;
        } else if (char === '/' && next === '/' && lineComments) {
            const end = css.indexOf('\n', i + 2);
            code += css.slice(kept, i) + ' ';
            i = kept = end === -1 ? css.length : end;
        } else if (isUrlStart(css, i)) {
            i = skipUrl(css, i + 'url('.length);
        } else {
            i++;
        }
    }

    return code + css.slice(kept);
}

/** The index after the string opening at `start`; an unterminated string ends at the line end. */
function skipString(css: string, start: number) {
    const quote = css[start];
    let i = start + 1;
    while (i < css.length) {
        const char = css[i];
        if (char === '\\') {
            i += 2;
        } else if (char === quote) {
            return i + 1;
        } else if (char === '\n') {
            return i;
        } else {
            i++;
        }
    }
    return css.length;
}

function isUrlStart(css: string, i: number) {
    return css.slice(i, i + 4).toLowerCase() === 'url(' && (i === 0 || !/[\w-]/.test(css.charAt(i - 1)));
}

/**
 * The index to resume scanning at after `url(`. A quoted URL resumes at its quote, so it is scanned
 * as a string; an unquoted one is skipped to its closing parenthesis.
 */
function skipUrl(css: string, start: number) {
    let i = start;
    while (i < css.length && /\s/.test(css.charAt(i))) {
        i++;
    }
    if (css[i] === '"' || css[i] === "'") {
        return i;
    }

    while (i < css.length) {
        const char = css[i];
        if (char === '\\') {
            i += 2;
        } else if (char === ')') {
            return i + 1;
        } else {
            i++;
        }
    }
    return css.length;
}
