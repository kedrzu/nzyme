import { stringify } from 'yaml';

import type { TranslationDocument } from './types.js';

/** Serializes a translation document to YAML format. */
export function toYaml(doc: TranslationDocument) {
    return stringify(doc);
}
