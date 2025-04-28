import type { Content } from 'mdast';
import type { Position } from 'unist';
import { describe, expect, it } from 'vitest';

import { streamMarkdown } from '../src/streamMarkdown.js';

// Helper function to process markdown and return AST
function processMarkdown(markdown: string) {
    const parser = streamMarkdown();
    parser.write(markdown);
    return parser.ast;
}

describe('streamMarkdown', () => {
    it('should parse plain text', () => {
        const markdown = 'Hello, world!';
        const ast = processMarkdown(markdown);
        const expected = [
            node({
                type: 'paragraph',
                children: [node({ type: 'text', value: 'Hello, world!' })],
            }),
        ];

        expect(ast).toEqual(expected);
    });

    it('should parse headings', () => {
        const markdown = '# Heading 1\n## Heading 2';
        const ast = processMarkdown(markdown);
        const expected = [
            node({
                type: 'heading',
                depth: 1,
                children: [node({ type: 'text', value: 'Heading 1' })],
            }),
            node({
                type: 'heading',
                depth: 2,
                children: [node({ type: 'text', value: 'Heading 2' })],
            }),
        ];

        expect(ast).toEqual(expected);
    });

    it('should parse links', () => {
        const markdown = '[OpenAI](https://openai.com)';
        const ast = processMarkdown(markdown);

        const expected = [
            node({
                type: 'paragraph',
                children: [
                    node({
                        type: 'link',
                        url: 'https://openai.com',
                        title: null,
                        children: [node({ type: 'text', value: 'OpenAI' })],
                    }),
                ],
            }),
        ];

        expect(ast).toEqual(expected);
    });

    it('should parse images', () => {
        const markdown = '![Alt text](https://example.com/image.png)';
        const ast = processMarkdown(markdown);

        const expected = [
            node({
                type: 'paragraph',
                children: [
                    node({
                        type: 'image',
                        url: 'https://example.com/image.png',
                        alt: 'Alt text',
                        title: null,
                    }),
                ],
            }),
        ];

        expect(ast).toEqual(expected);
    });

    it('should parse lists', () => {
        const markdown = '- Item 1\n- Item 2';
        const ast = processMarkdown(markdown);

        const expected = [
            node({
                type: 'list',
                ordered: false,
                spread: false,
                start: null,
                children: [
                    node({
                        type: 'listItem',
                        checked: null,
                        spread: false,
                        children: [
                            node({
                                type: 'paragraph',
                                children: [node({ type: 'text', value: 'Item 1' })],
                            }),
                        ],
                    }),
                    node({
                        type: 'listItem',
                        checked: null,
                        spread: false,
                        children: [
                            node({
                                type: 'paragraph',
                                children: [node({ type: 'text', value: 'Item 2' })],
                            }),
                        ],
                    }),
                ],
            }),
        ];

        expect(ast).toEqual(expected);
    });

    it('should parse ordered lists', () => {
        const markdown = '1. First\n2. Second';
        const ast = processMarkdown(markdown);

        const expected = [
            node({
                type: 'list',
                ordered: true,
                spread: false,
                start: 1,
                children: [
                    node({
                        type: 'listItem',
                        checked: null,
                        spread: false,
                        children: [
                            node({
                                type: 'paragraph',
                                children: [node({ type: 'text', value: 'First' })],
                            }),
                        ],
                    }),
                    node({
                        type: 'listItem',
                        checked: null,
                        spread: false,
                        children: [
                            node({
                                type: 'paragraph',
                                children: [node({ type: 'text', value: 'Second' })],
                            }),
                        ],
                    }),
                ],
            }),
        ];

        expect(ast).toEqual(expected);
    });
});

function node<T extends Content>(node: T): T {
    return {
        position: expect.any(Object) as Position,
        ...node,
    };
}
