import path from 'node:path';

import { Linter, RuleTester } from 'eslint';
import markdownPlugin from '@eslint/markdown';
import { describe, expect, it } from 'bun:test';

import { markdown } from '../markdown.js';
import { packageJson } from '../packageJson.js';
import { markdownFormat } from './markdownFormat.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../..');

const tester = new RuleTester({
    plugins: { markdown: markdownPlugin },
    language: 'markdown/gfm',
    languageOptions: { frontmatter: 'yaml' },
});

tester.run('markdown-format', markdownFormat, {
    valid: [
        {
            name: 'formatted file with YAML frontmatter and a compact table',
            code: '---\ntitle: x\n---\n\n# Title\n\n|a|b|\n|-|-|\n|1|2|\n\n- item\n',
        },
        {
            name: 'unformatted but gitignored file is skipped',
            code: '* item\n',
            filename: path.join(PACKAGE_ROOT, 'dist/fixture.md'),
        },
    ],
    invalid: [
        {
            name: 'unformatted file is rewritten whole',
            code: '* one\n* two\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |\n',
            filename: path.join(PACKAGE_ROOT, 'src/fixture.md'),
            output: '- one\n- two\n\n|a|b|\n|-|-|\n|1|2|\n',
            errors: [{ messageId: 'unformatted' }],
        },
    ],
});

it('runs next to the package.json preset and fixes Markdown through the shared plugin', () => {
    const linter = new Linter({ configType: 'flat', cwd: PACKAGE_ROOT });
    const result = linter.verifyAndFix('* item\n', [...packageJson(), ...markdown()], {
        filename: path.join(PACKAGE_ROOT, 'src/fixture.md'),
    });

    expect(result.messages).toEqual([]);
    expect(result.output).toBe('- item\n');
});
