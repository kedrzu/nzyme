import { serializeDocFile } from '../doc/codec.js';
import { toLocalLinks } from '../doc/links.js';
import type { OutlineDocument } from '../outline/OutlineTypes.js';

/**
 * The local file an Outline document is written as; its `shared` list and local-only frontmatter keys come from
 * the local side, as Outline knows neither.
 * @__NO_SIDE_EFFECTS__
 */
export function localContent(remote: OutlineDocument, shared: string[], extra: Record<string, unknown>): string {
    return serializeDocFile({ id: remote.id, shared, title: remote.title, text: toLocalLinks(remote.text), extra });
}
