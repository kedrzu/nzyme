import * as ts from 'typescript';

/**
 * Extracts a one-line summary from a node's leading JSDoc comment, for rendering into
 * generated index files. Multi-line summaries are joined and internal whitespace is
 * collapsed; the summary is the text before the first `@tag`, so a JSDoc carrying only
 * `@param`/`@returns` (no free-text summary) yields null, same as no JSDoc at all.
 * @__NO_SIDE_EFFECTS__
 */
export function jsdocSummary(node: ts.Node): string | null {
    const jsDoc = ts.getJSDocCommentsAndTags(node).find((tag): tag is ts.JSDoc => ts.isJSDoc(tag));
    const text = jsDoc && ts.getTextOfJSDocComment(jsDoc.comment);
    if (!text) {
        return null;
    }

    const collapsed = text.replace(/\s+/g, ' ').trim();
    return collapsed || null;
}
