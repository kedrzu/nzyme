import type { Root } from 'mdast';
import { remark } from 'remark';
import { expect, it } from 'vitest';

import { remarkSanitize } from './remarkSanitize.js';

/**
 * Helper to parse markdown with remarkSanitize and return the processed AST
 */
function parseWithSanitize(markdown: string): Root {
    const processor = remark().use(remarkSanitize);
    const ast = processor.parse(markdown);
    const transformed = processor.runSync(ast);
    return transformed;
}

it('should remove position information from all nodes', () => {
    const ast = parseWithSanitize('# Hello\n\nWorld');

    // Check root
    expect(ast.position).toBeUndefined();

    // Check heading
    const heading = ast.children[0];
    expect(heading?.position).toBeUndefined();

    if (heading && 'children' in heading) {
        // Check text node inside heading
        const headingText = heading.children[0];
        expect(headingText?.position).toBeUndefined();
    }

    // Check paragraph
    const paragraph = ast.children[1];
    expect(paragraph?.position).toBeUndefined();

    if (paragraph && 'children' in paragraph) {
        // Check text node inside paragraph
        const paragraphText = paragraph.children[0];
        expect(paragraphText?.position).toBeUndefined();
    }
});

it('should remove position from deeply nested nodes', () => {
    const ast = parseWithSanitize('- Item 1\n  - Nested item\n- Item 2');

    // Visit all nodes recursively
    function checkNoPosition(node: unknown): void {
        if (typeof node !== 'object' || node === null) {
            return;
        }

        const obj = node as Record<string, unknown>;
        expect(obj.position).toBeUndefined();

        if (Array.isArray(obj.children)) {
            for (const child of obj.children) {
                checkNoPosition(child);
            }
        }
    }

    checkNoPosition(ast);
});

it('should collapse multiple whitespaces into single space', () => {
    const ast = parseWithSanitize('Hello    world   with    spaces');

    const paragraph = ast.children[0];
    if (paragraph && paragraph.type === 'paragraph') {
        const text = paragraph.children[0];
        if (text && text.type === 'text') {
            expect(text.value).toBe('Hello world with spaces');
        } else {
            throw new Error('Expected text node');
        }
    } else {
        throw new Error('Expected paragraph node');
    }
});

it('should replace hyphens in words with non-breaking hyphens', () => {
    const ast = parseWithSanitize('This is a well-known fact about COVID-19');

    const paragraph = ast.children[0];
    if (paragraph && paragraph.type === 'paragraph') {
        const text = paragraph.children[0];
        if (text && text.type === 'text') {
            // \u2011 is non-breaking hyphen
            expect(text.value).toContain('well‑known');
            expect(text.value).toContain('COVID‑19');
        } else {
            throw new Error('Expected text node');
        }
    } else {
        throw new Error('Expected paragraph node');
    }
});

it('should not replace standalone hyphens', () => {
    const ast = parseWithSanitize('Item - description');

    const paragraph = ast.children[0];
    if (paragraph && paragraph.type === 'paragraph') {
        const text = paragraph.children[0];
        if (text && text.type === 'text') {
            // Regular hyphen should remain
            expect(text.value).toContain(' - ');
        } else {
            throw new Error('Expected text node');
        }
    } else {
        throw new Error('Expected paragraph node');
    }
});

it('should replace underscores between words with non-breaking spaces', () => {
    const ast = parseWithSanitize('This is word_word and another_one');

    const paragraph = ast.children[0];
    if (paragraph && paragraph.type === 'paragraph') {
        const text = paragraph.children[0];
        if (text && text.type === 'text') {
            // \u00a0 is non-breaking space
            expect(text.value).toContain('word\u00a0word');
            expect(text.value).toContain('another\u00a0one');
        } else {
            throw new Error('Expected text node');
        }
    } else {
        throw new Error('Expected paragraph node');
    }
});

it('should add non-breaking space after short words (orphan prevention)', () => {
    const ast = parseWithSanitize('I am a short word');

    const paragraph = ast.children[0];
    if (paragraph && paragraph.type === 'paragraph') {
        const text = paragraph.children[0];
        if (text && text.type === 'text') {
            // \u00a0 is non-breaking space
            // Short words (1-2 chars) should have non-breaking space after them
            // Note: Due to regex behavior, not ALL short words get it (no overlapping matches)
            expect(text.value).toContain('I\u00a0');
            expect(text.value).toContain('a\u00a0');
            // "am" won't get non-breaking space due to regex matching behavior
        } else {
            throw new Error('Expected text node');
        }
    } else {
        throw new Error('Expected paragraph node');
    }
});

it('should not add non-breaking space after short word if followed by long word', () => {
    const ast = parseWithSanitize('I am extraordinary person');

    const paragraph = ast.children[0];
    if (paragraph && paragraph.type === 'paragraph') {
        const text = paragraph.children[0];
        if (text && text.type === 'text') {
            // The non-breaking space before "extraordinary" (12+ chars) should be rolled back
            expect(text.value).toContain('am extraordinary');
        } else {
            throw new Error('Expected text node');
        }
    } else {
        throw new Error('Expected paragraph node');
    }
});

it('should not sanitize text without spaces (likely IDs)', () => {
    const ast = parseWithSanitize('abc_def_ghi');

    const paragraph = ast.children[0];
    if (paragraph && paragraph.type === 'paragraph') {
        const text = paragraph.children[0];
        if (text && text.type === 'text') {
            // No spaces in original, so underscores should remain
            expect(text.value).toBe('abc_def_ghi');
        } else {
            throw new Error('Expected text node');
        }
    } else {
        throw new Error('Expected paragraph node');
    }
});

it('should unwrap redundant paragraph in list item', () => {
    const ast = parseWithSanitize('- Item 1\n- Item 2');

    const list = ast.children[0];
    if (list && list.type === 'list') {
        const listItem = list.children[0];
        if (listItem && listItem.type === 'listItem') {
            // The paragraph should be unwrapped, so children should be text/inline nodes directly
            const firstChild = listItem.children[0];
            expect(firstChild?.type).toBe('text');
        } else {
            throw new Error('Expected listItem node');
        }
    } else {
        throw new Error('Expected list node');
    }
});

it('should unwrap redundant paragraph in nested list', () => {
    const ast = parseWithSanitize('- Item 1\n  - Nested\n- Item 2');

    const list = ast.children[0];
    if (list && list.type === 'list') {
        const listItem = list.children[0];
        if (listItem && listItem.type === 'listItem') {
            // When a list item contains both text and a nested list,
            // the paragraph is NOT unwrapped (only unwraps when single child)
            expect(listItem.children).toHaveLength(2);
            expect(listItem.children[0]?.type).toBe('paragraph');
            expect(listItem.children[1]?.type).toBe('list');

            // Second item (which only has text) should have unwrapped paragraph
            const secondItem = list.children[1];
            if (secondItem && secondItem.type === 'listItem') {
                expect(secondItem.children[0]?.type).toBe('text');
            } else {
                throw new Error('Expected second listItem node');
            }

            // Check nested list item
            const nestedList = listItem.children[1];
            if (nestedList && nestedList.type === 'list') {
                const nestedItem = nestedList.children[0];
                if (nestedItem && nestedItem.type === 'listItem') {
                    // Nested item with single paragraph should be unwrapped
                    expect(nestedItem.children[0]?.type).toBe('text');
                } else {
                    throw new Error('Expected nested listItem node');
                }
            } else {
                throw new Error('Expected nested list node');
            }
        } else {
            throw new Error('Expected listItem node');
        }
    } else {
        throw new Error('Expected list node');
    }
});

it('should not unwrap if list item has multiple paragraphs', () => {
    const ast = parseWithSanitize('- First paragraph\n\n  Second paragraph');

    const list = ast.children[0];
    if (list && list.type === 'list') {
        const listItem = list.children[0];
        if (listItem && listItem.type === 'listItem') {
            // Should have 2 paragraph children (not unwrapped)
            expect(listItem.children).toHaveLength(2);
            expect(listItem.children[0]?.type).toBe('paragraph');
            expect(listItem.children[1]?.type).toBe('paragraph');
        } else {
            throw new Error('Expected listItem node');
        }
    } else {
        throw new Error('Expected list node');
    }
});

it('should convert soft line breaks to break nodes', () => {
    const ast = parseWithSanitize('Line one  \nLine two');

    const paragraph = ast.children[0];
    if (paragraph && paragraph.type === 'paragraph') {
        expect(paragraph.children).toHaveLength(3);
        expect(paragraph.children[0]?.type).toBe('text');
        expect(paragraph.children[1]?.type).toBe('break');
        expect(paragraph.children[2]?.type).toBe('text');
    } else {
        throw new Error('Expected paragraph node');
    }
});

it('should handle complex markdown with all features', () => {
    const markdown = `# Hello World

This is a test-case with multiple    spaces.

- Item with well-known fact
- Another item
  - Nested item`;

    const ast = parseWithSanitize(markdown);

    // Verify no positions anywhere
    function hasNoPositions(node: unknown): boolean {
        if (typeof node !== 'object' || node === null) {
            return true;
        }

        const obj = node as Record<string, unknown>;
        if ('position' in obj) {
            return false;
        }

        if (Array.isArray(obj.children)) {
            for (const child of obj.children) {
                if (!hasNoPositions(child)) {
                    return false;
                }
            }
        }

        return true;
    }

    expect(hasNoPositions(ast)).toBe(true);

    // Verify text is sanitized
    const paragraph = ast.children[1];
    if (paragraph && paragraph.type === 'paragraph') {
        const text = paragraph.children[0];
        if (text && text.type === 'text') {
            expect(text.value).toContain('test‑case'); // non-breaking hyphen
            expect(text.value).not.toContain('    '); // spaces collapsed
        }
    }

    // Verify list items have unwrapped paragraphs
    const list = ast.children[2];
    if (list && list.type === 'list') {
        const firstItem = list.children[0];
        if (firstItem && firstItem.type === 'listItem') {
            expect(firstItem.children[0]?.type).toBe('text');
        }
    }
});

it('should handle empty markdown', () => {
    const ast = parseWithSanitize('');
    expect(ast.children).toHaveLength(0);
});

it('should handle markdown with only whitespace', () => {
    const ast = parseWithSanitize('   \n\n   ');
    expect(ast.children).toHaveLength(0);
});

it('should preserve emphasis and strong nodes while sanitizing text', () => {
    const ast = parseWithSanitize('This is **bold with well-known** and *italic*');

    const paragraph = ast.children[0];
    if (paragraph && paragraph.type === 'paragraph') {
        expect(paragraph.children).toHaveLength(4); // text, strong, text, emphasis

        // Check that strong node exists
        const strong = paragraph.children[1];
        expect(strong?.type).toBe('strong');

        // Check that text inside strong is sanitized
        if (strong && strong.type === 'strong') {
            const strongText = strong.children[0];
            if (strongText && strongText.type === 'text') {
                expect(strongText.value).toContain('well‑known');
            }
        }
    } else {
        throw new Error('Expected paragraph node');
    }
});

it('should handle links while sanitizing surrounding text', () => {
    const ast = parseWithSanitize('Go to [our site](https://example.com) or to another');

    const paragraph = ast.children[0];
    if (paragraph && paragraph.type === 'paragraph') {
        expect(paragraph.children).toHaveLength(3); // text, link, text

        const link = paragraph.children[1];
        expect(link?.type).toBe('link');

        // Check text before link is sanitized (Go and to are short words)
        const textBefore = paragraph.children[0];
        if (textBefore && textBefore.type === 'text') {
            expect(textBefore.value).toContain('Go\u00a0'); // non-breaking space after short word
        }

        // Check text after link (or and to are short words)
        const textAfter = paragraph.children[2];
        if (textAfter && textAfter.type === 'text') {
            expect(textAfter.value).toContain('or\u00a0'); // non-breaking space after short word
        }
    } else {
        throw new Error('Expected paragraph node');
    }
});

it('should handle code blocks without sanitizing their content', () => {
    const ast = parseWithSanitize('Some text here\n\n```\ncode with    spaces\n```');

    expect(ast.children).toHaveLength(2);

    // First child should be paragraph with sanitized text
    const paragraph = ast.children[0];
    if (paragraph && paragraph.type === 'paragraph') {
        const text = paragraph.children[0];
        if (text && text.type === 'text') {
            // Check that text was sanitized (multiple spaces should be single)
            expect(text.value).not.toContain('  ');
            expect(text.value).toContain('Some');
        }
    }

    // Second child should be code block with unsanitized content
    const code = ast.children[1];
    if (code && code.type === 'code') {
        // Code block content should preserve multiple spaces
        expect(code.value).toContain('    ');
    } else {
        throw new Error('Expected code block');
    }
});

it('should handle inline code without sanitizing its content', () => {
    const ast = parseWithSanitize('Use `some_var_name` in your code');

    const paragraph = ast.children[0];
    if (paragraph && paragraph.type === 'paragraph') {
        const inlineCode = paragraph.children[1];
        if (inlineCode && inlineCode.type === 'inlineCode') {
            // Inline code content should not be sanitized
            expect(inlineCode.value).toBe('some_var_name');
        } else {
            throw new Error('Expected inlineCode node');
        }
    } else {
        throw new Error('Expected paragraph node');
    }
});
