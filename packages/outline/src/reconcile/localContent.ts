import { serializeDocFile } from '../doc/codec.js';
import { toLocalLinks } from '../doc/links.js';
import type { OutlineDocument } from '../outline/OutlineTypes.js';

/**
 * The local file an Outline document is written as; its local-only frontmatter keys come from the local side, as
 * Outline does not know them.
 * @__NO_SIDE_EFFECTS__
 */
export function localContent(remote: OutlineDocument, extra: Record<string, unknown>): string {
    return serializeDocFile({ id: remote.id, title: remote.title, text: toLocalLinks(remote.text), extra });
}
