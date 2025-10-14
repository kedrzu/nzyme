import { stringify } from 'yaml';

import type { TranslationDocument } from './types.js';

/**
 *
 */
export function toYaml(doc: TranslationDocument) {
    return stringify(doc);
}
