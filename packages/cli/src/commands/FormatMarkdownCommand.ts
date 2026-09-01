import fs from 'node:fs/promises';
import * as path from 'node:path';

import chalk from 'chalk';
import type { Break, Link, Parents } from 'mdast';
import type { Info, State } from 'mdast-util-to-markdown';
import { defaultHandlers } from 'mdast-util-to-markdown';
import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';

import { isFileIgnored } from '@nzyme/project-utils/isFileIgnored.js';
import { forEachParalell } from '@nzyme/utils/array/forEachParalell.js';

import { Command } from '../Command.js';
import { Option } from '../index.js';

const MARKDOWN_REGEX = /\.mdx?$/;

/** Bounded parallelism for file processing — high throughput without opening a handle per file. */
const CONCURRENCY = 20;

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
 * Token-minimising markdown formatter. Reserialises markdown files (or every `.md`/`.mdx`
 * file under the given directories) through remark with compact GFM tables — the opposite
 * of an aligning formatter like oxfmt/prettier. Reusable across projects; point it at any
 * markdown that should stay small (e.g. agent skill files).
 */
export class FormatMarkdownCommand extends Command {
    static override paths = [['format-markdown']];

    static override usage = Command.Usage({
        category: 'Format',
        description: 'Format markdown for minimal tokens (compact GFM tables)',
        details: `
            Reserialises markdown through remark with un-padded GFM tables and single-space
            list indentation. Arguments are files or directories; directories are walked
            recursively for .md/.mdx files (gitignored paths are skipped). With no arguments
            the current working directory is used. Pass --exclude to skip a file or directory
            (e.g. generated/scraped docs or a nested submodule); repeatable. By default only a
            summary count is printed; pass --verbose to log every file formatted/reformatted.
        `,
        examples: [
            ['Format the whole repo', 'nzyme format-markdown .'],
            [
                'Skip generated docs and a submodule',
                'nzyme format-markdown . --exclude nzyme --exclude packages/scraped-docs',
            ],
            ['Check without writing', 'nzyme format-markdown --check docs'],
            ['List each file formatted', 'nzyme format-markdown --verbose docs'],
        ],
    });

    check = Option.Boolean('--check,-c', {
        description: 'Do not write; exit non-zero if any file would change',
    });

    verbose = Option.Boolean('--verbose,-v', {
        description: 'Log each file formatted/reformatted (default: summary count only)',
    });

    exclude = Option.Array('--exclude,-e', [], {
        description: 'File or directory to skip (repeatable)',
    });

    inputs = Option.Rest();

    cwd = process.cwd();

    /**
     *
     */
    override async run() {
        const inputs = this.inputs.length > 0 ? this.inputs : ['.'];
        const excluded = new Set(this.exclude.map(entry => this.toAbsolute(entry)));

        const files: string[] = [];
        for (const input of inputs) {
            await this.collectFiles(this.toAbsolute(input), excluded, files);
        }

        let changed = 0;
        await forEachParalell(files, {
            concurrency: CONCURRENCY,
            callback: async file => {
                const source = await fs.readFile(file, 'utf-8');
                const safelyFormatted = String(await processor.process(source));
                const formatted = safelyFormatted === source ? source : removeInertEscapes(safelyFormatted);

                if (formatted === source) {
                    return;
                }

                changed++;
                if (this.check) {
                    if (this.verbose) {
                        const relative = path.relative(this.cwd, file);
                        this.logger.warn(`Would reformat ${chalk.yellow(relative)}`);
                    }
                } else {
                    await fs.writeFile(file, formatted);
                    if (this.verbose) {
                        const relative = path.relative(this.cwd, file);
                        this.logger.info(`Formatted ${chalk.green(relative)}`);
                    }
                }
            },
        });

        if (this.check && changed > 0) {
            this.logger.error(`${changed} markdown file(s) are not formatted`);
            return 1;
        }

        this.logger.info(
            `${this.check ? 'Checked' : 'Formatted'} ${files.length} markdown file(s), ${changed} changed`,
        );
        return 0;
    }

    private async collectFiles(target: string, excluded: Set<string>, results: string[]) {
        if (excluded.has(target) || isFileIgnored(target) === true) {
            return;
        }

        const stats = await fs.stat(target);
        if (stats.isDirectory()) {
            const entries = await fs.readdir(target, { withFileTypes: true });
            for (const entry of entries) {
                await this.collectFiles(path.join(target, entry.name), excluded, results);
            }
        } else if (stats.isFile() && MARKDOWN_REGEX.test(target)) {
            results.push(target);
        }
    }

    private toAbsolute(file: string) {
        return path.isAbsolute(file) ? file : path.join(this.cwd, file);
    }
}
