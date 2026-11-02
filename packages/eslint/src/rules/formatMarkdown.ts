import type { Break, Link, Parents } from 'mdast';
import type { Info, State } from 'mdast-util-to-markdown';
import { defaultHandlers } from 'mdast-util-to-markdown';
import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';

/** Parse-only pipeline used to check whether dropping an escape changes document structure. */
const structureChecker = remark().use(remarkFrontmatter, ['yaml']).use(remarkGfm, { singleTilde: false });

/**
 * Removes backslashes that do not affect how the complete document parses. Checking the whole
 * document keeps surrounding delimiters in view and covers escapes emitted outside text nodes,
 * such as image destinations and line-start punctuation.
 * @__NO_SIDE_EFFECTS__
 */
function removeInertEscapes(markdown: string): string {
    const expectedStructure = markdownStructure(markdown);
    let result = markdown;

    const escapedCharacters = new Set<string>();
    for (const match of markdown.matchAll(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g)) {
        escapedCharacters.add(match[0]);
    }
    for (const escaped of escapedCharacters) {
        const candidate = result.split(escaped).join(escaped.slice(1));
        if (candidate !== result && markdownStructure(candidate) === expectedStructure) {
            result = candidate;
        }
    }

    const escapePositions: number[] = [];
    for (const match of result.matchAll(/\\[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g)) {
        if (match.index != null) {
            escapePositions.push(match.index);
        }
    }

    return removeEscapeGroup(result, escapePositions);

    function removeEscapeGroup(current: string, positions: number[]): string {
        if (positions.length === 0) {
            return current;
        }

        let candidate = '';
        let copiedThrough = 0;
        for (const position of positions) {
            candidate += current.slice(copiedThrough, position);
            copiedThrough = position + 1;
        }
        candidate += current.slice(copiedThrough);

        if (markdownStructure(candidate) === expectedStructure) {
            return candidate;
        }
        if (positions.length === 1) {
            return current;
        }

        const midpoint = Math.ceil(positions.length / 2);
        const afterRight = removeEscapeGroup(current, positions.slice(midpoint));
        return removeEscapeGroup(afterRight, positions.slice(0, midpoint));
    }
}

/**
 * Serializes an mdast tree without source positions so equivalent parses compare identically.
 * @__NO_SIDE_EFFECTS__
 */
function markdownStructure(markdown: string): string {
    return JSON.stringify(structureChecker.parse(markdown), (key, value: unknown) =>
        key === 'position' ? undefined : value,
    );
}

/**
 * Whether the bare text alone parses back into exactly the same link, i.e. it is a literal
 * autolink that gfm-autolink-literal re-links on its own. Asking the parser instead of matching
 * known schemes is what keeps ordinary links whose text equals their destination — relative paths
 * like `[README.md](README.md)` or `[#anchor](#anchor)` — from being unwrapped into plain text,
 * which would destroy them.
 * @__NO_SIDE_EFFECTS__
 */
function isLiteralAutolink(text: string, url: string): boolean {
    const root = structureChecker.parse(text);
    const [paragraph, ...blocks] = root.children;
    if (blocks.length > 0 || paragraph?.type !== 'paragraph') {
        return false;
    }

    const [link, ...siblings] = paragraph.children;
    if (siblings.length > 0 || link?.type !== 'link' || link.url !== url || link.title) {
        return false;
    }

    const [child, ...rest] = link.children;
    return rest.length === 0 && child?.type === 'text' && child.value === text;
}

/**
 * Link handler that emits a bare literal autolink instead of wrapping it. gfm-autolink-literal
 * parses bare URLs/emails into link nodes, and the default stringifier then emits noise:
 * `http://localhost:6006` → `<http://localhost:6006>`, `a@b.com` → `<a@b.com>`, and
 * `www.foo.com` → `[www.foo.com](http://www.foo.com)`. When a link is exactly such an autolink —
 * a single text child, no title, and text the parser turns back into this very link — return the
 * raw text so it stays bare. This renders identically (gfm re-links it) and is idempotent.
 * Everything else defers to the default handler.
 */
function unwrapAutolink(node: Link, parent: Parents | undefined, state: State, info: Info): string {
    const [child, ...rest] = node.children;
    if (!node.title && rest.length === 0 && child?.type === 'text') {
        if (isLiteralAutolink(child.value, node.url)) {
            return child.value;
        }
    }
    return defaultHandlers.link(node, parent, state, info);
}

/**
 * Hard-break handler: emit the invisible two-space form instead of the default visible `\`.
 * Delegates to the default handler first so unsafe scopes (table cells, headings — where a raw
 * newline is illegal) still collapse to a space. Only the real backslash break is rewritten, and
 * it is `info.before`-aware: if the preceding text already ends in spaces, emit only enough to
 * total two, so `word \` (one stray source space) canonicalises to exactly `word␣␣` in a single
 * pass rather than `word␣␣␣` (idempotency would otherwise need two passes).
 */
function twoSpaceBreak(node: Break, parent: Parents | undefined, state: State, info: Info): string {
    const rendered = defaultHandlers.break(node, parent, state, info);
    if (rendered !== '\\\n') {
        return rendered;
    }
    const trailingSpaces = (/ *$/.exec(info.before) ?? [''])[0].length;
    return ' '.repeat(Math.max(0, 2 - trailingSpaces)) + '\n';
}

/**
 * remark-stringify settings tuned to minimise tokens: compact (unaligned) GFM tables,
 * single-space list indentation, `-` bullets/rules, and prose-preserving handlers (no escaping
 * noise, bare URLs, invisible hard breaks). No prose re-wrapping — remark preserves author line
 * breaks by default.
 */
const STRINGIFY_SETTINGS = {
    bullet: '-',
    listItemIndent: 'one',
    rule: '-',
    fences: true,
    tightDefinitions: true,
    handlers: { link: unwrapAutolink, break: twoSpaceBreak },
} as const;

/**
 * A remark pipeline that round-trips YAML frontmatter verbatim and renders GFM tables
 * without alignment padding — the padding oxfmt adds is the dominant token cost.
 */
const processor = remark()
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm, { tablePipeAlign: false, tableCellPadding: false, singleTilde: false })
    .data('settings', STRINGIFY_SETTINGS);

/**
 * Formats Markdown for minimal tokens: reserialises it through remark with compact GFM tables,
 * single-space list indentation and prose-preserving handlers, then drops escapes that do not change
 * how the document parses. Returns the input unchanged when it is already formatted.
 * @__NO_SIDE_EFFECTS__
 */
export function formatMarkdown(source: string): string {
    const safelyFormatted = String(processor.processSync(source));
    return safelyFormatted === source ? source : removeInertEscapes(safelyFormatted);
}
