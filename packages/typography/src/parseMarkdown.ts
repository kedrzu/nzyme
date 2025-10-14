import type { Content } from 'mdast';
import { newlineToBreak } from 'mdast-util-newline-to-break';
import remarkBehead from 'remark-behead';
import remarkDirective from 'remark-directive';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { fixOrphans } from './fixOrphans.js';

type MarkdownOptions = {
    minHeaderLevel?: number;
};

/**
 * Parses markdown string into an AST.
 */
export function parseMarkdown(markdown: string, options: MarkdownOptions = {}) {
    const parser = createParser(options);
    const ast = parser.parse(markdown).children;

    for (const node of ast) {
        newlineToBreak(node);
        visit(node, node => {
            delete node.position;

            if (node.type === 'text') {
                node.value = sanitizeText(node.value);
            } else if ('children' in node) {
                node.children = unwrapRedundantParagraphs(
                    node.children as Content[],
                ) as typeof node.children;
            }
        });
    }

    if (ast.length === 0) {
        return null;
    }

    if (ast.length === 1) {
        const first = ast[0]!;
        if (first.type === 'text') {
            return first.value;
        }
    }

    return ast;
}

function createParser(options: MarkdownOptions) {
    const parser = unified().use(remarkParse).use(remarkDirective);

    if (options.minHeaderLevel) {
        return (
            parser
                // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
                .use(remarkBehead, { minDepth: options.minHeaderLevel } as any)
        );
    }

    return parser;
}

/**
 * Markdown parser is wrapping texts with paragraphs even if they are not needed.
 * For example in list node. We are getting rid of those redundant paragraphs
 * for lower DOM nesting and better performance.
 */
function unwrapRedundantParagraphs(nodes: Content[]): Content[] {
    if (nodes.length === 1 && nodes[0]!.type === 'paragraph') {
        return nodes[0].children;
    }

    return nodes;
}

const multiWhiteSpaceRegex = /[\s\uFEFF\xA0]+/gmu;
const hyphensInWordRegex = /[\p{L}\p{N}](-)[\p{L}\p{N}]/gmu;
const underscoreBetweenWordsRegex = /(\w)_(\w)/gmu;

function sanitizeText(text: string) {
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

    // Replace underscores between words with non-breakable space
    text = text.replace(underscoreBetweenWordsRegex, (_match, first, second) => {
        return first + '\xa0' + second;
    });

    text = fixOrphans(text);

    return text;
}
