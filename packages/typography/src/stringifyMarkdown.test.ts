import { describe, expect, it } from 'vitest';

import { parseMarkdown } from './parseMarkdown.js';
import { stringifyMarkdown } from './stringifyMarkdown.js';

/**
 * Normalizes spaces in strings by replacing non-breaking spaces with regular spaces
 * to handle the markdown parser's space transformations
 */
function normalizeSpaces(str: string): string {
    return str
        .replace(/\u00A0/g, ' ') // Normal non-breaking space
        .replace(/\u202F/g, ' ') // Narrow non-breaking space
        .replace(/\u2011/g, '-'); // Non-breaking hyphen
}

describe('basic text elements', () => {
    it('should handle plain text', () => {
        const md = parseMarkdown('Hello world');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Hello world');
    });

    it('should handle text with emphasis', () => {
        const md = parseMarkdown('This is *italic* text');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('This is italic text');
    });

    it('should handle text with strong emphasis', () => {
        const md = parseMarkdown('This is **bold** text');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('This is bold text');
    });

    it('should handle text with both emphasis and strong', () => {
        const md = parseMarkdown('This is ***bold italic*** text');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('This is bold italic text');
    });

    it('should handle inline code', () => {
        const md = parseMarkdown('Use `console.log()` to debug');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Use console.log() to debug');
    });
});

describe('paragraphs and line breaks', () => {
    it('should handle single paragraph', () => {
        const md = parseMarkdown('This is a paragraph.');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('This is a paragraph.');
    });

    it('should handle multiple paragraphs', () => {
        const md = parseMarkdown('First paragraph.\n\nSecond paragraph.\n\nThird paragraph.');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('First paragraph.\n\nSecond paragraph.\n\nThird paragraph.');
    });

    it('should handle hard line breaks', () => {
        const md = parseMarkdown('Line one  \nLine two');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Line one\nLine two');
    });

    it('should handle multiple hard line breaks in paragraph', () => {
        const md = parseMarkdown('Line 1  \nLine 2  \nLine 3');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Line 1\nLine 2\nLine 3');
    });
});

describe('headings', () => {
    it('should handle h1', () => {
        const md = parseMarkdown('# Heading 1');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Heading 1');
    });

    it('should handle h2', () => {
        const md = parseMarkdown('## Heading 2');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Heading 2');
    });

    it('should handle h3', () => {
        const md = parseMarkdown('### Heading 3');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Heading 3');
    });

    it('should handle heading followed by paragraph', () => {
        const md = parseMarkdown('# Title\n\nSome content here.');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Title\n\nSome content here.');
    });

    it('should handle multiple headings and paragraphs', () => {
        const md = parseMarkdown('# Main Title\n\nIntro text.\n\n## Section 1\n\nSection content.');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Main Title\n\nIntro text.\n\nSection 1\n\nSection content.');
    });
});

describe('links', () => {
    it('should handle link with text', () => {
        const md = parseMarkdown('[Click here](https://example.com)');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Click here');
    });

    it('should handle link without text using URL', () => {
        const md = parseMarkdown('[](https://example.com)');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('https://example.com');
    });

    it('should handle link in paragraph', () => {
        const md = parseMarkdown('Visit [our website](https://example.com) for more info.');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Visit our website for more info.');
    });

    it('should handle multiple links', () => {
        const md = parseMarkdown('[First](https://one.com) and [Second](https://two.com)');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('First and Second');
    });
});

describe('unordered lists', () => {
    it('should handle simple unordered list', () => {
        const md = parseMarkdown('- Item 1\n- Item 2\n- Item 3');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('• Item 1\n• Item 2\n• Item 3');
    });

    it('should handle unordered list with text content', () => {
        const md = parseMarkdown('- First item\n- Second item with more text\n- Third');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('• First item\n• Second item with more text\n• Third');
    });

    it('should handle nested unordered lists', () => {
        const md = parseMarkdown('- Item 1\n  - Nested 1.1\n  - Nested 1.2\n- Item 2');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('• Item 1\n  • Nested 1.1\n  • Nested 1.2\n• Item 2');
    });

    it('should handle deeply nested unordered lists', () => {
        const md = parseMarkdown('- Level 1\n  - Level 2\n    - Level 3');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('• Level 1\n  • Level 2\n    • Level 3');
    });
});

describe('ordered lists', () => {
    it('should handle simple ordered list', () => {
        const md = parseMarkdown('1. First\n2. Second\n3. Third');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('1. First\n2. Second\n3. Third');
    });

    it('should handle ordered list with text content', () => {
        const md = parseMarkdown('1. First item with text\n2. Second item\n3. Third item');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('1. First item with text\n2. Second item\n3. Third item');
    });

    it('should handle nested ordered lists', () => {
        const md = parseMarkdown('1. Item 1\n   1. Nested 1.1\n   2. Nested 1.2\n2. Item 2');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('1. Item 1\n  1. Nested 1.1\n  2. Nested 1.2\n2. Item 2');
    });
});

describe('mixed lists', () => {
    it('should handle unordered list nested in ordered', () => {
        const md = parseMarkdown('1. First\n   - Nested bullet\n   - Another bullet\n2. Second');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('1. First\n  • Nested bullet\n  • Another bullet\n2. Second');
    });

    it('should handle ordered list nested in unordered', () => {
        const md = parseMarkdown('- First\n  1. Nested one\n  2. Nested two\n- Second');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('• First\n  1. Nested one\n  2. Nested two\n• Second');
    });
});

describe('complex structures', () => {
    it('should handle list with emphasis and links', () => {
        const md = parseMarkdown('- **Bold** item\n- *Italic* item\n- [Link](https://example.com) item');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('• Bold item\n• Italic item\n• Link item');
    });

    it('should handle mixed content document', () => {
        const md = parseMarkdown(
            '# Title\n\nIntro paragraph with **bold** and *italic*.\n\n## Section\n\n- Item 1\n- Item 2\n\nFinal paragraph.',
        );
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe(
            'Title\n\nIntro paragraph with bold and italic.\n\nSection\n\n• Item 1\n• Item 2\n\nFinal paragraph.',
        );
    });

    it('should handle paragraph with inline code and links', () => {
        const md = parseMarkdown('Use `npm install` from [npm](https://npmjs.com) to install packages.');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Use npm install from npm to install packages.');
    });

    it('should handle list items with line breaks', () => {
        const md = parseMarkdown('- First line  \nSecond line\n- Another item');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('• First line\nSecond line\n• Another item');
    });
});

describe('edge cases', () => {
    it('should handle empty string', () => {
        const md = parseMarkdown('');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('');
    });

    it('should handle only whitespace', () => {
        const md = parseMarkdown('   \n\n   ');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('');
    });

    it('should handle paragraph with only spaces', () => {
        const md = parseMarkdown('Text before\n\n     \n\nText after');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Text before\n\nText after');
    });

    it('should handle empty list', () => {
        const md = parseMarkdown('-');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('•');
    });
});

describe('whitespace handling', () => {
    it('should normalize multiple consecutive paragraphs', () => {
        const md = parseMarkdown('Para 1\n\nPara 2\n\nPara 3');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Para 1\n\nPara 2\n\nPara 3');
    });

    it('should trim leading and trailing whitespace', () => {
        const md = parseMarkdown('\n\nContent\n\n');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Content');
    });

    it('should preserve intentional line breaks within paragraphs', () => {
        const md = parseMarkdown('Line 1  \nLine 2  \nLine 3');
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe('Line 1\nLine 2\nLine 3');
    });
});

describe('realistic examples', () => {
    it('should handle a blog post structure', () => {
        const md = parseMarkdown(
            '# My Blog Post\n\nThis is the introduction paragraph.\n\n## Overview\n\nSome overview text here.\n\n## Key Points\n\n- First point\n- Second point\n- Third point\n\n## Conclusion\n\nFinal thoughts.',
        );
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe(
            'My Blog Post\n\nThis is the introduction paragraph.\n\nOverview\n\nSome overview text here.\n\nKey Points\n\n• First point\n• Second point\n• Third point\n\nConclusion\n\nFinal thoughts.',
        );
    });

    it('should handle a README structure', () => {
        const md = parseMarkdown(
            '# Project Name\n\nDescription of the project.\n\n## Installation\n\n1. Clone the repo\n2. Run `npm install`\n3. Start with `npm start`\n\n## Features\n\n- Feature 1\n- Feature 2\n\nVisit [docs](https://example.com) for more.',
        );
        const result = normalizeSpaces(stringifyMarkdown(md));
        expect(result).toBe(
            'Project Name\n\nDescription of the project.\n\nInstallation\n\n1. Clone the repo\n2. Run npm install\n3. Start with npm start\n\nFeatures\n\n• Feature 1\n• Feature 2\n\nVisit docs for more.',
        );
    });
});
