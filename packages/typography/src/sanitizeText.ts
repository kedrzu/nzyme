import { fixOrphans } from './fixOrphans.js';

const multiWhiteSpaceRegex = /[\s\uFEFF\xA0]+/gmu;
const hyphensInWordRegex = /[\p{L}\p{N}](-)[\p{L}\p{N}]/gmu;
const underscoreBetweenWordsRegex = /(\S)_(\S)/gmu;

/**
 * Sanitizes text
 *
 * @__NO_SIDE_EFFECTS__
 */
export function sanitizeText(text: string) {
    // if text does not contain any spaces it may be some ID
    if (text.indexOf(' ') < 0) {
        return text;
    }

    // collapse multiple white-spaces into single space
    text = text.replace(multiWhiteSpaceRegex, ' ');
    // replace hhyphens with their non-breakable version
    // [\p{L}\p{N}] matches all unicode letters and numbers
    text = text.replace(hyphensInWordRegex, match => {
        return match.replace('-', '‑');
    });

    text = fixOrphans(text);

    // Replace underscores between non-whitespace characters with a non-breakable space.
    // Done last so these explicit markers survive fixOrphans' long-word rollback.
    text = text.replace(underscoreBetweenWordsRegex, (_match, first, second) => {
        return first + '\xa0' + second;
    });

    return text;
}
