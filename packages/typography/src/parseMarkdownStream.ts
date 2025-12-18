import type { Root, RootContent } from 'mdast';
import type { Processor } from 'unified';

/**
 * Options for parsing markdown stream.
 */
export interface ParseMarkdownStreamOptions {
    /**
     * The markdown string to parse.
     * Must be a full markdown document.
     * When streaming you need to append the remaining markdown to the end of the document and rerun the parser.
     */
    markdown: string;

    /**
     * The root node to parse into.
     * If not provided, a new root node will be created.
     * Pass the previous result of the parser to continue parsing.
     */
    root?: Root;

    /**
     * The unified processor to use to parse the markdown.
     */
    parser: Processor<Root>;
}

/**
 * Parses markdown string into an AST and runs all transformers.
 * When streaming you need to append the remaining markdown to the end of the document and rerun the parser.
 * Pass the previous result of the parser to continue parsing.
 */
export function parseMarkdownStream(options: ParseMarkdownStreamOptions) {
    const root: Root = options.root || { type: 'root', children: [] };
    const markdown = options.markdown;
    const parser = options.parser;

    const nodes = root.children;

    if (nodes.length > 0) {
        // Drop last element
        nodes.length = nodes.length - 1;
    }

    const end = nodes[nodes.length - 1]?.position?.end.offset || 0;
    const current = markdown.slice(end);
    let newRoot = parser.parse(current);
    newRoot = parser.runSync(newRoot) as Root;

    for (const element of newRoot.children) {
        root.children.push(transformNode(element, end));
    }

    return root;
}

function transformNode<T extends RootContent>(node: T, end: number): RootContent {
    const position = node.position;
    if (position) {
        position.end.offset = (position.end.offset ?? 0) + end;
        position.start.offset = (position.start.offset ?? 0) + end;
    }

    if ('children' in node) {
        const children = node.children as RootContent[];
        for (let i = 0; i < children.length; i++) {
            children[i] = transformNode(children[i]!, end);
        }
    }

    return node;
}
