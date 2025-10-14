import type { mdast } from './types.js';

interface StringifyContext {
    listDepth: number;
    listItemIndex: number;
    insideListItem: boolean;
}

/**
 * Renders markdown to plain text string, stripping all formatting but preserving structure with newlines.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function stringifyMarkdown(node: mdast.Nodes): string {
    const result = stringifyNode(node, { listDepth: 0, listItemIndex: 0, insideListItem: false });
    return clampNewlines(result.trim());
}

function stringifyNode(node: mdast.Nodes, ctx: StringifyContext): string {
    switch (node.type) {
        case 'break':
            return '\n';

        case 'code':
            return node.value;

        case 'emphasis':
            return stringifyChildren(node.children, ctx);

        case 'heading':
            return '\n' + stringifyChildren(node.children, ctx) + '\n\n';

        case 'inlineCode':
            return node.value;

        case 'link':
            return node.children.length > 0 ? stringifyChildren(node.children, ctx) : node.url;

        case 'list': {
            const items = node.children.map((child, index) => {
                const itemCtx: StringifyContext = {
                    listDepth: ctx.listDepth + 1,
                    listItemIndex: node.ordered ? index + 1 : 0,
                    insideListItem: false,
                };
                return stringifyNode(child, itemCtx);
            });
            // If nested inside a list item, don't add any newlines - just return the items
            if (ctx.insideListItem) {
                return '\n' + items.join('');
            }
            // Top-level list adds newlines before and after
            return '\n' + items.join('') + '\n';
        }

        case 'listItem': {
            const prefix = ctx.listItemIndex > 0 ? `${ctx.listItemIndex}. ` : '• ';
            const indent = '  '.repeat(Math.max(0, ctx.listDepth - 1));
            const itemCtx: StringifyContext = {
                ...ctx,
                insideListItem: true,
            };
            const content = stringifyChildren(node.children, itemCtx);
            // Trim to remove extra whitespace but preserve the structure
            return indent + prefix + content.trim() + '\n';
        }

        case 'paragraph':
            // Inside list items, paragraphs should not add extra spacing
            if (ctx.insideListItem) {
                return stringifyChildren(node.children, ctx);
            }
            return stringifyChildren(node.children, ctx) + '\n\n';

        case 'root':
            return stringifyChildren(node.children, ctx);

        case 'strong':
            return stringifyChildren(node.children, ctx);

        case 'text':
            return node.value;

        default:
            return '';
    }
}

function stringifyChildren(children: mdast.Nodes[], ctx: StringifyContext): string {
    return children.map(child => stringifyNode(child, ctx)).join('');
}

function clampNewlines(text: string): string {
    // Replace 3 or more consecutive newlines with exactly 2 newlines (one empty line)
    return text.replace(/\n{3,}/g, '\n\n');
}
