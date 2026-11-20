import { basename, extname } from 'node:path';

import type { FileFingerprintResult } from './FileFingerprint.js';
import { fingerprintBunLock } from './fingerprintBunLock.js';
import { fingerprintScript } from './fingerprintScript.js';
import { fingerprintVue } from './fingerprintVue.js';
import { normalizeWhitespace } from './normalizeWhitespace.js';
import { getMd5Hash } from '@nzyme/crypto';

/**
 * Fingerprints a file by the part of its code a change touches: function bodies or the code that
 * runs at module load (see {@link FileFingerprint}).
 *
 * Scripts (`.ts`, `.tsx`, `.mts`, `.js`, `.mjs`) and Vue SFCs are split. A stylesheet (`.css`,
 * `.scss`, `.sass`, `.less`) has no load-time/call-time split, so `body` and `top` are one hash of its
 * text with whitespace normalised: whatever level a variant stores it at, any change but formatting
 * changes the hash it compares. A `bun.lock` is split the same way, by the part that installs code from
 * outside the workspace ({@link fingerprintBunLock}): a change to its workspace part changes neither
 * hash. Anything else, and any file that does not parse, is `'whole'`.
 * @__NO_SIDE_EFFECTS__
 */
export function fingerprintFile(path: string, content: string): FileFingerprintResult {
    if (basename(path) === 'bun.lock') {
        const hash = fingerprintBunLock(content);
        return hash === null ? 'whole' : { body: hash, top: hash, loadImports: [] };
    }

    switch (extname(path)) {
        case '.ts':
        case '.mts':
            return fingerprintScript(content, 'ts');
        case '.tsx':
            return fingerprintScript(content, 'tsx');
        case '.js':
        case '.mjs':
            return fingerprintScript(content, 'js');
        case '.vue':
            return fingerprintVue(path, content);
        case '.css':
        case '.scss':
        case '.sass':
        case '.less': {
            const hash = getMd5Hash(normalizeWhitespace(content));
            return { body: hash, top: hash, loadImports: [] };
        }
        default:
            return 'whole';
    }
}
