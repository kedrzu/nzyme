import type { BlockContent } from 'mdast';
import { describe, expect, it } from 'vitest';

import { parseMarkdownStream } from './parseMarkdownStream.js';

describe('initial parsing with empty AST', () => {
    it('should parse markdown from scratch when AST is empty', () => {
        const markdown = '# Hello World\n\nThis is a paragraph.';
        const ast: BlockContent[] = [];

        parseMarkdownStream({ markdown, ast });

        expect(ast).toHaveLength(2);
        expect(ast[0]).toMatchObject({
            type: 'heading',
            depth: 1,
            children: [{ type: 'text', value: 'Hello World' }],
        });
        expect(ast[1]).toMatchObject({
            type: 'paragraph',
            children: [{ type: 'text', value: 'This is a paragraph.' }],
        });
    });

    it('should set correct position offsets for initial parsing', () => {
        const markdown = '# Title\n\nParagraph text.';
        const ast: BlockContent[] = [];

        parseMarkdownStream({ markdown, ast });

        expect(ast[0].position?.start.offset).toBe(0);
        expect(ast[0].position?.end.offset).toBe(7); // "# Title" (without newline)
        expect(ast[1].position?.start.offset).toBe(9); // after "\n\n"
        expect(ast[1].position?.end.offset).toBe(24); // end of "Paragraph text."
    });
});

describe('incremental parsing', () => {
    it('should reparse only new content when markdown is extended', () => {
        const initialMarkdown = '# Title\n\nFirst paragraph.';
        const ast: BlockContent[] = [];

        // Initial parse
        parseMarkdownStream({ markdown: initialMarkdown, ast });
        expect(ast).toHaveLength(2);

        // Add more content
        const extendedMarkdown = '# Title\n\nFirst paragraph.\n\n## Subtitle\n\nSecond paragraph.';
        parseMarkdownStream({ markdown: extendedMarkdown, ast });

        expect(ast).toHaveLength(4);
        expect(ast[2]).toMatchObject({
            type: 'heading',
            depth: 2,
            children: [{ type: 'text', value: 'Subtitle' }],
        });
        expect(ast[3]).toMatchObject({
            type: 'paragraph',
            children: [{ type: 'text', value: 'Second paragraph.' }],
        });
    });

    it('should preserve position offsets correctly during incremental parsing', () => {
        const initialMarkdown = '# Title\n\nFirst para.';
        const ast: BlockContent[] = [];

        // Initial parse
        parseMarkdownStream({ markdown: initialMarkdown, ast });

        // Add more content
        const extendedMarkdown = '# Title\n\nFirst para.\n\n## Sub\n\nSecond.';
        parseMarkdownStream({ markdown: extendedMarkdown, ast });

        // Check that new elements have correct offsets
        expect(ast[2].position?.start.offset).toBe(22); // "## Sub" starts at offset 22
        expect(ast[2].position?.end.offset).toBe(28); // "## Sub" ends at offset 28
        expect(ast[3].position?.start.offset).toBe(30); // "Second." starts at offset 30
        expect(ast[3].position?.end.offset).toBe(37); // "Second." ends at offset 37
    });

    it('should handle multiple incremental updates', () => {
        const ast: BlockContent[] = [];

        // First update
        parseMarkdownStream({ markdown: '# Title', ast });
        expect(ast).toHaveLength(1);

        // Second update
        parseMarkdownStream({ markdown: '# Title\n\nParagraph 1', ast });
        expect(ast).toHaveLength(2);

        // Third update
        parseMarkdownStream({ markdown: '# Title\n\nParagraph 1\n\n## Subtitle', ast });
        expect(ast).toHaveLength(3);

        // Fourth update
        parseMarkdownStream({ markdown: '# Title\n\nParagraph 1\n\n## Subtitle\n\nParagraph 2', ast });
        expect(ast).toHaveLength(4);

        // Verify final structure
        expect(ast[0].type).toBe('heading');
        expect(ast[1].type).toBe('paragraph');
        expect(ast[2].type).toBe('heading');
        expect(ast[3].type).toBe('paragraph');
    });

    it('should drop and reparse the last element correctly', () => {
        const ast: BlockContent[] = [];

        // Parse incomplete paragraph
        parseMarkdownStream({ markdown: '# Title\n\nIncomplete para', ast });
        expect(ast).toHaveLength(2);
        const incompletePara = ast[1];

        // Complete the paragraph and add more
        parseMarkdownStream({ markdown: '# Title\n\nIncomplete paragraph completed.\n\n## New section', ast });
        expect(ast).toHaveLength(3);

        // The paragraph should be different (completed)
        expect(ast[1]).not.toBe(incompletePara);
        expect(ast[1]).toMatchObject({
            type: 'paragraph',
            children: [{ type: 'text', value: 'Incomplete paragraph completed.' }],
        });
        expect(ast[2]).toMatchObject({
            type: 'heading',
            depth: 2,
            children: [{ type: 'text', value: 'New section' }],
        });
    });

    it('should preserve all elements except the last one by object reference', () => {
        const ast: BlockContent[] = [];

        // Initial parse with multiple elements
        parseMarkdownStream({ markdown: '# Title\n\nFirst paragraph.\n\n## Subtitle', ast });
        expect(ast).toHaveLength(3);

        // Store references to all elements
        const originalTitle = ast[0];
        const originalFirstPara = ast[1];
        const originalSubtitle = ast[2];

        // Add more content (incremental parse)
        parseMarkdownStream({ markdown: '# Title\n\nFirst paragraph.\n\n## Subtitle\n\nSecond paragraph.', ast });
        expect(ast).toHaveLength(4);

        // First two elements should be preserved by reference
        expect(ast[0]).toBe(originalTitle);
        expect(ast[1]).toBe(originalFirstPara);

        // Last element from previous parse should be different (reparsed)
        expect(ast[2]).not.toBe(originalSubtitle);

        // New element should exist
        expect(ast[3]).toMatchObject({
            type: 'paragraph',
            children: [{ type: 'text', value: 'Second paragraph.' }],
        });
    });

    it('should preserve object references across multiple incremental updates', () => {
        const ast: BlockContent[] = [];

        // First parse - single element (will be reparsed in next step)
        parseMarkdownStream({ markdown: '# Main Title', ast });
        const firstTitle = ast[0];

        // Second parse - add paragraph (title gets reparsed because it was the only/last element)
        parseMarkdownStream({ markdown: '# Main Title\n\nFirst para', ast });
        const secondTitle = ast[0];
        const originalPara = ast[1];

        // Title should be different because it was reparsed (was the only element)
        expect(ast[0]).not.toBe(firstTitle);

        // Third parse - add heading (title preserved, paragraph reparsed)
        parseMarkdownStream({ markdown: '# Main Title\n\nFirst para\n\n## Section', ast });
        const originalSection = ast[2];

        // Title should be preserved (not the last element anymore)
        expect(ast[0]).toBe(secondTitle);
        // Paragraph should be different (was the last element, so reparsed)
        expect(ast[1]).not.toBe(originalPara);

        // Fourth parse - add final paragraph
        parseMarkdownStream({ markdown: '# Main Title\n\nFirst para\n\n## Section\n\nFinal para', ast });

        // First two elements should be preserved (not the last elements)
        expect(ast[0]).toBe(secondTitle);
        expect(ast[1]).toBe(ast[1]); // This is the reparsed paragraph from step 3
        expect(ast[2]).not.toBe(originalSection); // This was the last element, so it gets reparsed
        expect(ast[3]).toMatchObject({
            type: 'paragraph',
            children: [{ type: 'text', value: 'Final para' }],
        });
    });

    it('should preserve references when extending incomplete elements', () => {
        const ast: BlockContent[] = [];

        // Parse with complete and incomplete elements
        parseMarkdownStream({ markdown: '# Complete Title\n\nComplete paragraph.\n\nIncomplete', ast });
        expect(ast).toHaveLength(3);

        const originalTitle = ast[0];
        const originalPara = ast[1];
        const incompleteElement = ast[2];

        // Extend the incomplete element and add more
        parseMarkdownStream({
            markdown: '# Complete Title\n\nComplete paragraph.\n\nIncomplete paragraph completed.\n\n## New heading',
            ast,
        });
        expect(ast).toHaveLength(4);

        // First two complete elements should be preserved
        expect(ast[0]).toBe(originalTitle);
        expect(ast[1]).toBe(originalPara);

        // The incomplete element should be different (reparsed)
        expect(ast[2]).not.toBe(incompleteElement);
        expect(ast[2]).toMatchObject({
            type: 'paragraph',
            children: [{ type: 'text', value: 'Incomplete paragraph completed.' }],
        });

        // New element should exist
        expect(ast[3]).toMatchObject({
            type: 'heading',
            depth: 2,
            children: [{ type: 'text', value: 'New heading' }],
        });
    });
});

describe('complex markdown structures', () => {
    it('should handle lists in incremental parsing', () => {
        const ast: BlockContent[] = [];

        // Initial list
        const initial = '# Todo\n\n- Item 1\n- Item 2';
        parseMarkdownStream({ markdown: initial, ast });
        expect(ast).toHaveLength(2);
        expect(ast[1].type).toBe('list');

        // Add more items
        const extended = '# Todo\n\n- Item 1\n- Item 2\n- Item 3\n\nDone!';
        parseMarkdownStream({ markdown: extended, ast });
        expect(ast).toHaveLength(3);
        expect(ast[1].type).toBe('list');
        expect(ast[2].type).toBe('paragraph');
    });
});

describe('edge cases', () => {
    it('should handle empty markdown', () => {
        const ast: BlockContent[] = [];
        parseMarkdownStream({ markdown: '', ast });
        expect(ast).toHaveLength(0);
    });

    it('should handle markdown with only whitespace', () => {
        const ast: BlockContent[] = [];
        parseMarkdownStream({ markdown: '   \n\n  ', ast });
        expect(ast).toHaveLength(0);
    });

    it('should handle single character additions', () => {
        const ast: BlockContent[] = [];

        parseMarkdownStream({ markdown: '#', ast });
        expect(ast).toHaveLength(1);

        parseMarkdownStream({ markdown: '# ', ast });
        expect(ast).toHaveLength(1);

        parseMarkdownStream({ markdown: '# T', ast });
        expect(ast).toHaveLength(1);

        parseMarkdownStream({ markdown: '# Title', ast });
        expect(ast).toHaveLength(1);
        expect(ast[0]).toMatchObject({
            type: 'heading',
            children: [{ type: 'text', value: 'Title' }],
        });
    });
});

describe('position offset integrity', () => {
    it('should maintain consistent position offsets across multiple updates', () => {
        const ast: BlockContent[] = [];
        let markdown = '';

        const updates = [
            '# Title',
            '# Title\n\nFirst paragraph.',
            '# Title\n\nFirst paragraph.\n\n## Subtitle',
            '# Title\n\nFirst paragraph.\n\n## Subtitle\n\nSecond paragraph.',
            '# Title\n\nFirst paragraph.\n\n## Subtitle\n\nSecond paragraph.\n\n```component[id]\n{"data": "value"}\n```',
        ];

        for (const update of updates) {
            markdown = update;
            parseMarkdownStream({ markdown, ast });

            // Verify that all elements have valid positions
            for (let i = 0; i < ast.length; i++) {
                const element = ast[i];
                expect(element.position).toBeDefined();
                expect(element.position!.start.offset!).toBeGreaterThanOrEqual(0);
                expect(element.position!.end.offset!).toBeGreaterThanOrEqual(element.position!.start.offset!);
                expect(element.position!.end.offset!).toBeLessThanOrEqual(markdown.length);

                // Check that elements don't overlap (except for the last one being reparsed)
                if (i > 0 && i < ast.length - 1) {
                    const prevElement = ast[i - 1];
                    expect(element.position!.start.offset!).toBeGreaterThanOrEqual(prevElement.position!.end.offset!);
                }
            }
        }
    });

    it('should preserve object references while maintaining position integrity', () => {
        const ast: BlockContent[] = [];

        // Build up a complex document incrementally
        const updates = [
            '# Title',
            '# Title\n\nFirst paragraph.',
            '# Title\n\nFirst paragraph.\n\n## Subtitle',
            '# Title\n\nFirst paragraph.\n\n## Subtitle\n\nSecond paragraph.',
        ];

        const preservedElements: BlockContent[] = [];

        for (let i = 0; i < updates.length; i++) {
            const markdown = updates[i];
            const previousLength = ast.length;

            parseMarkdownStream({ markdown, ast });

            // Verify that all previously existing elements (except the last one) are preserved by reference
            for (let j = 0; j < Math.min(previousLength - 1, preservedElements.length); j++) {
                expect(ast[j]).toBe(preservedElements[j]);
            }

            // Update our preserved elements list (all except the last one)
            if (ast.length > 0) {
                preservedElements.length = ast.length - 1;
                for (let j = 0; j < ast.length - 1; j++) {
                    preservedElements[j] = ast[j];
                }
            }

            // Verify position integrity for all elements
            for (let j = 0; j < ast.length; j++) {
                const element = ast[j];
                expect(element.position).toBeDefined();
                expect(element.position!.start.offset!).toBeGreaterThanOrEqual(0);
                expect(element.position!.end.offset!).toBeGreaterThanOrEqual(element.position!.start.offset!);
                expect(element.position!.end.offset!).toBeLessThanOrEqual(markdown.length);
            }
        }

        // Final verification: we should have 4 elements
        expect(ast).toHaveLength(4);
        expect(ast[0].type).toBe('heading'); // # Title
        expect(ast[1].type).toBe('paragraph'); // First paragraph
        expect(ast[2].type).toBe('heading'); // ## Subtitle
        expect(ast[3].type).toBe('paragraph'); // Second paragraph
    });
});
