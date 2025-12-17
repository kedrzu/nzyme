import type { Root, RootContent } from 'mdast';
import { newlineToBreak } from 'mdast-util-newline-to-break';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

import { fixOrphans } from './fixOrphans.js';

/**
 * A unified plugin that postprocesses the markdown AST by:
 * - Converting newlines to break nodes
 * - Removing position information
 * - Sanitizing text content
 * - Unwrapping redundant paragraphs
 */
export const remarkSanitize: Plugin<[], Root> = () => {
    return tree => {
        // Convert newlines to break nodes for each child
        for (const node of tree.children) {
            newlineToBreak(node);
        }

        // Visit all nodes including the root's children
        visit(tree, node => {
            // Sanitize text content
            if (node.type === 'text') {
                node.value = sanitizeText(node.value);
            }
            // Unwrap redundant paragraphs only in list items
            else if (node.type === 'listItem' && 'children' in node) {
                node.children = unwrapRedundantParagraphs(node.children) as typeof node.children;
            }
        });

        return tree;
    };
};

/**
 * Markdown parser is wrapping texts with paragraphs even if they are not needed.
 * For example in list node. We are getting rid of those redundant paragraphs
 * for lower DOM nesting and better performance.
 *
 * @__NO_SIDE_EFFECTS__
 */
function unwrapRedundantParagraphs(nodes: RootContent[]): RootContent[] {
    if (nodes.length === 1 && nodes[0]!.type === 'paragraph') {
        return nodes[0].children;
    }

    return nodes;
}

const multiWhiteSpaceRegex = /[\s\uFEFF\xA0]+/gmu;
const hyphensInWordRegex = /[\p{L}\p{N}](-)[\p{L}\p{N}]/gmu;
const underscoreBetweenWordsRegex = /(\w)_(\w)/gmu;

/**
 * Sanitizes text
 *
 * @__NO_SIDE_EFFECTS__
 */
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
