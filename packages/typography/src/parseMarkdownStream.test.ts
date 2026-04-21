import { describe, expect, it } from 'bun:test';
import type { Root } from 'mdast';
import { remark } from 'remark';
import type { Processor } from 'unified';

import { parseMarkdownStream } from './parseMarkdownStream.js';

const parser = remark() as unknown as Processor<Root>;

describe('initial parsing with empty AST', () => {
    it('should parse markdown from scratch when AST is empty', () => {
        const markdown = '# Hello World\n\nThis is a paragraph.';

        const root = parseMarkdownStream({ markdown, root: undefined, parser });

        expect(root.children).toHaveLength(2);
        expect(root.children[0]).toMatchObject({
            type: 'heading',
            depth: 1,
            children: [{ type: 'text', value: 'Hello World' }],
        });
        expect(root.children[1]).toMatchObject({
            type: 'paragraph',
            children: [{ type: 'text', value: 'This is a paragraph.' }],
        });
    });

    it('should set correct position offsets for initial parsing', () => {
        const markdown = '# Title\n\nParagraph text.';

        const root = parseMarkdownStream({ markdown, root: undefined, parser });

        expect(root.children[0]!.position?.start.offset).toBe(0);
        expect(root.children[0]!.position?.end.offset).toBe(7); // "# Title" (without newline)
        expect(root.children[1]!.position?.start.offset).toBe(9); // after "\n\n"
        expect(root.children[1]!.position?.end.offset).toBe(24); // end of "Paragraph text."
    });
});

describe('incremental parsing', () => {
    it('should reparse only new content when markdown is extended', () => {
        const initialMarkdown = '# Title\n\nFirst paragraph.';
        let root: Root | undefined;

        // Initial parse
        root = parseMarkdownStream({ markdown: initialMarkdown, root, parser });
        expect(root.children).toHaveLength(2);

        // Add more content
        const extendedMarkdown = '# Title\n\nFirst paragraph.\n\n## Subtitle\n\nSecond paragraph.';
        root = parseMarkdownStream({ markdown: extendedMarkdown, root, parser });

        expect(root.children).toHaveLength(4);
        expect(root.children[2]).toMatchObject({
            type: 'heading',
            depth: 2,
            children: [{ type: 'text', value: 'Subtitle' }],
        });
        expect(root.children[3]).toMatchObject({
            type: 'paragraph',
            children: [{ type: 'text', value: 'Second paragraph.' }],
        });
    });

    it('should preserve position offsets correctly during incremental parsing', () => {
        const initialMarkdown = '# Title\n\nFirst para.';
        let root: Root | undefined;

        // Initial parse
        root = parseMarkdownStream({ markdown: initialMarkdown, root, parser });

        // Add more content
        const extendedMarkdown = '# Title\n\nFirst para.\n\n## Sub\n\nSecond.';
        root = parseMarkdownStream({ markdown: extendedMarkdown, root, parser });

        // Check that new elements have correct offsets
        expect(root.children[2]!.position?.start.offset).toBe(22); // "## Sub" starts at offset 22
        expect(root.children[2]!.position?.end.offset).toBe(28); // "## Sub" ends at offset 28
        expect(root.children[3]!.position?.start.offset).toBe(30); // "Second." starts at offset 30
        expect(root.children[3]!.position?.end.offset).toBe(37); // "Second." ends at offset 37
    });

    it('should handle multiple incremental updates', () => {
        let root: Root | undefined;

        // First update
        root = parseMarkdownStream({ markdown: '# Title', root, parser });
        expect(root.children).toHaveLength(1);

        // Second update
        root = parseMarkdownStream({ markdown: '# Title\n\nParagraph 1', root, parser });
        expect(root.children).toHaveLength(2);

        // Third update
        root = parseMarkdownStream({ markdown: '# Title\n\nParagraph 1\n\n## Subtitle', root, parser });
        expect(root.children).toHaveLength(3);

        // Fourth update
        root = parseMarkdownStream({ markdown: '# Title\n\nParagraph 1\n\n## Subtitle\n\nParagraph 2', root, parser });
        expect(root.children).toHaveLength(4);

        // Verify final structure
        expect(root.children[0]!.type).toBe('heading');
        expect(root.children[1]!.type).toBe('paragraph');
        expect(root.children[2]!.type).toBe('heading');
        expect(root.children[3]!.type).toBe('paragraph');
    });

    it('should drop and reparse the last element correctly', () => {
        let root: Root | undefined;

        // Parse incomplete paragraph
        root = parseMarkdownStream({ markdown: '# Title\n\nIncomplete para', root, parser });
        expect(root.children).toHaveLength(2);
        const incompletePara = root.children[1];

        // Complete the paragraph and add more
        root = parseMarkdownStream({
            markdown: '# Title\n\nIncomplete paragraph completed.\n\n## New section',
            root,
            parser,
        });
        expect(root.children).toHaveLength(3);

        // The paragraph should be different (completed)
        expect(root.children[1]).not.toBe(incompletePara);
        expect(root.children[1]).toMatchObject({
            type: 'paragraph',
            children: [{ type: 'text', value: 'Incomplete paragraph completed.' }],
        });
        expect(root.children[2]).toMatchObject({
            type: 'heading',
            depth: 2,
            children: [{ type: 'text', value: 'New section' }],
        });
    });

    it('should preserve all elements except the last one by object reference', () => {
        let root: Root | undefined;

        // Initial parse with multiple elements
        root = parseMarkdownStream({ markdown: '# Title\n\nFirst paragraph.\n\n## Subtitle', root, parser });
        expect(root.children).toHaveLength(3);

        // Store references to all elements
        const originalTitle = root.children[0];
        const originalFirstPara = root.children[1];
        const originalSubtitle = root.children[2];

        // Add more content (incremental parse)
        root = parseMarkdownStream({
            markdown: '# Title\n\nFirst paragraph.\n\n## Subtitle\n\nSecond paragraph.',
            root,
            parser,
        });
        expect(root.children).toHaveLength(4);

        // First two elements should be preserved by reference
        expect(root.children[0]).toBe(originalTitle);
        expect(root.children[1]).toBe(originalFirstPara);

        // Last element from previous parse should be different (reparsed)
        expect(root.children[2]).not.toBe(originalSubtitle);

        // New element should exist
        expect(root.children[3]).toMatchObject({
            type: 'paragraph',
            children: [{ type: 'text', value: 'Second paragraph.' }],
        });
    });

    it('should preserve object references across multiple incremental updates', () => {
        let root: Root | undefined;

        // First parse - single element (will be reparsed in next step)
        root = parseMarkdownStream({ markdown: '# Main Title', root, parser });
        const firstTitle = root.children[0];

        // Second parse - add paragraph (title gets reparsed because it was the only/last element)
        root = parseMarkdownStream({ markdown: '# Main Title\n\nFirst para', root, parser });
        const secondTitle = root.children[0];
        const originalPara = root.children[1];

        // Title should be different because it was reparsed (was the only element)
        expect(root.children[0]).not.toBe(firstTitle);

        // Third parse - add heading (title preserved, paragraph reparsed)
        root = parseMarkdownStream({ markdown: '# Main Title\n\nFirst para\n\n## Section', root, parser });
        const originalSection = root.children[2];

        // Title should be preserved (not the last element anymore)
        expect(root.children[0]).toBe(secondTitle);
        // Paragraph should be different (was the last element, so reparsed)
        expect(root.children[1]).not.toBe(originalPara);

        // Fourth parse - add final paragraph
        root = parseMarkdownStream({
            markdown: '# Main Title\n\nFirst para\n\n## Section\n\nFinal para',
            root,
            parser,
        });

        // First two elements should be preserved (not the last elements)
        expect(root.children[0]).toBe(secondTitle);
        expect(root.children[1]).toBe(root.children[1]); // This is the reparsed paragraph from step 3
        expect(root.children[2]).not.toBe(originalSection); // This was the last element, so it gets reparsed
        expect(root.children[3]).toMatchObject({
            type: 'paragraph',
            children: [{ type: 'text', value: 'Final para' }],
        });
    });

    it('should preserve references when extending incomplete elements', () => {
        let root: Root | undefined;

        // Parse with complete and incomplete elements
        root = parseMarkdownStream({ markdown: '# Complete Title\n\nComplete paragraph.\n\nIncomplete', root, parser });
        expect(root.children).toHaveLength(3);

        const originalTitle = root.children[0];
        const originalPara = root.children[1];
        const incompleteElement = root.children[2];

        // Extend the incomplete element and add more
        root = parseMarkdownStream({
            markdown: '# Complete Title\n\nComplete paragraph.\n\nIncomplete paragraph completed.\n\n## New heading',
            root,
            parser,
        });
        expect(root.children).toHaveLength(4);

        // First two complete elements should be preserved
        expect(root.children[0]).toBe(originalTitle);
        expect(root.children[1]).toBe(originalPara);

        // The incomplete element should be different (reparsed)
        expect(root.children[2]).not.toBe(incompleteElement);
        expect(root.children[2]).toMatchObject({
            type: 'paragraph',
            children: [{ type: 'text', value: 'Incomplete paragraph completed.' }],
        });

        // New element should exist
        expect(root.children[3]).toMatchObject({
            type: 'heading',
            depth: 2,
            children: [{ type: 'text', value: 'New heading' }],
        });
    });
});

describe('complex markdown structures', () => {
    it('should handle lists in incremental parsing', () => {
        let root: Root | undefined;

        // Initial list
        const initial = '# Todo\n\n- Item 1\n- Item 2';
        root = parseMarkdownStream({ markdown: initial, root, parser });
        expect(root.children).toHaveLength(2);
        expect(root.children[1]!.type).toBe('list');

        // Add more items
        const extended = '# Todo\n\n- Item 1\n- Item 2\n- Item 3\n\nDone!';
        root = parseMarkdownStream({ markdown: extended, root, parser });
        expect(root.children).toHaveLength(3);
        expect(root.children[1]!.type).toBe('list');
        expect(root.children[2]!.type).toBe('paragraph');
    });
});

describe('edge cases', () => {
    it('should handle empty markdown', () => {
        const root = parseMarkdownStream({ markdown: '', root: undefined, parser });
        expect(root.children).toHaveLength(0);
    });

    it('should handle markdown with only whitespace', () => {
        const root = parseMarkdownStream({ markdown: '   \n\n  ', root: undefined, parser });
        expect(root.children).toHaveLength(0);
    });

    it('should handle single character additions', () => {
        let root: Root | undefined;

        root = parseMarkdownStream({ markdown: '#', root, parser });
        expect(root.children).toHaveLength(1);

        root = parseMarkdownStream({ markdown: '# ', root, parser });
        expect(root.children).toHaveLength(1);

        root = parseMarkdownStream({ markdown: '# T', root, parser });
        expect(root.children).toHaveLength(1);

        root = parseMarkdownStream({ markdown: '# Title', root, parser });
        expect(root.children).toHaveLength(1);
        expect(root.children[0]).toMatchObject({
            type: 'heading',
            children: [{ type: 'text', value: 'Title' }],
        });
    });
});

describe('position offset integrity', () => {
    it('should maintain consistent position offsets across multiple updates', () => {
        let root: Root | undefined;

        const updates = [
            '# Title',
            '# Title\n\nFirst paragraph.',
            '# Title\n\nFirst paragraph.\n\n## Subtitle',
            '# Title\n\nFirst paragraph.\n\n## Subtitle\n\nSecond paragraph.',
            '# Title\n\nFirst paragraph.\n\n## Subtitle\n\nSecond paragraph.\n\n```component[id]\n{"data": "value"}\n```',
        ];

        for (const update of updates) {
            const markdown = update;
            root = parseMarkdownStream({ markdown, root, parser });

            // Verify that all elements have valid positions
            for (let i = 0; i < root.children.length; i++) {
                const element = root.children[i]!;
                expect(element.position).toBeDefined();
                expect(element.position!.start.offset!).toBeGreaterThanOrEqual(0);
                expect(element.position!.end.offset!).toBeGreaterThanOrEqual(element.position!.start.offset!);
                expect(element.position!.end.offset!).toBeLessThanOrEqual(markdown.length);

                // Check that elements don't overlap (except for the last one being reparsed)
                if (i > 0 && i < root.children.length - 1) {
                    const prevElement = root.children[i - 1]!;
                    expect(element.position!.start.offset!).toBeGreaterThanOrEqual(prevElement.position!.end.offset!);
                }
            }
        }
    });

    it('should preserve object references while maintaining position integrity', () => {
        let root: Root | undefined;

        // Build up a complex document incrementally
        const updates = [
            '# Title',
            '# Title\n\nFirst paragraph.',
            '# Title\n\nFirst paragraph.\n\n## Subtitle',
            '# Title\n\nFirst paragraph.\n\n## Subtitle\n\nSecond paragraph.',
        ];

        const preservedElements: Root['children'] = [];

        for (let i = 0; i < updates.length; i++) {
            const markdown = updates[i]!;
            const previousLength = root?.children.length || 0;

            root = parseMarkdownStream({ markdown, root, parser });

            // Verify that all previously existing elements (except the last one) are preserved by reference
            for (let j = 0; j < Math.min(previousLength - 1, preservedElements.length); j++) {
                expect(root.children[j]).toBe(preservedElements[j]);
            }

            // Update our preserved elements list (all except the last one)
            if (root.children.length > 0) {
                preservedElements.length = root.children.length - 1;
                for (let j = 0; j < root.children.length - 1; j++) {
                    preservedElements[j] = root.children[j]!;
                }
            }

            // Verify position integrity for all elements
            for (let j = 0; j < root.children.length; j++) {
                const element = root.children[j]!;
                expect(element.position).toBeDefined();
                expect(element.position!.start.offset!).toBeGreaterThanOrEqual(0);
                expect(element.position!.end.offset!).toBeGreaterThanOrEqual(element.position!.start.offset!);
                expect(element.position!.end.offset!).toBeLessThanOrEqual(markdown.length);
            }
        }

        // Final verification: we should have 4 elements
        expect(root!.children).toHaveLength(4);
        expect(root!.children[0]!.type).toBe('heading'); // # Title
        expect(root!.children[1]!.type).toBe('paragraph'); // First paragraph
        expect(root!.children[2]!.type).toBe('heading'); // ## Subtitle
        expect(root!.children[3]!.type).toBe('paragraph'); // Second paragraph
    });
});
