import { extname } from 'node:path';

import type { FileFingerprintResult } from './FileFingerprint.js';
import { fingerprintScript } from './fingerprintScript.js';
import { fingerprintStyle } from './fingerprintStyle.js';
import { fingerprintVue } from './fingerprintVue.js';

/**
 * Fingerprints a file by the part of its code a change touches: function bodies or the code that
 * runs at module load (see {@link FileFingerprint}). Changes to types, comments or formatting alone
 * change neither hash.
 *
 * Scripts (`.ts`, `.tsx`, `.mts`, `.js`, `.mjs`) and Vue SFCs are split; stylesheets (`.css`,
 * `.scss`, `.sass`, `.less`) get one hash for both parts (see {@link fingerprintStyle}); anything
 * else, and any file that does not parse, is `'whole'`.
 * @__NO_SIDE_EFFECTS__
 */
export function fingerprintFile(path: string, content: string): FileFingerprintResult {
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
        case '.less':
            return fingerprintStyle(content, extname(path).slice(1));
        default:
            return 'whole';
    }
}
