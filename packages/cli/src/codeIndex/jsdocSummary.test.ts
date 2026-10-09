import { expect, test } from 'bun:test';
import * as ts from 'typescript';

import { jsdocSummary } from './jsdocSummary.js';

/** Parses a single-statement source snippet and returns its first statement node. */
function firstStatement(src: string): ts.Node {
    const sourceFile = ts.createSourceFile('x.ts', src, ts.ScriptTarget.Latest, true);
    return sourceFile.statements[0]!;
}

test('collapses a multi-line JSDoc summary into a single line', () => {
    const node = firstStatement(`
        /**
         * Formats a date
         * relative to now.
         */
        export function formatRelativeDate() {}
    `);

    expect(jsdocSummary(node)).toBe('Formats a date relative to now.');
});

test('returns null for a node with no JSDoc', () => {
    const node = firstStatement(`export function formatRelativeDate() {}`);

    expect(jsdocSummary(node)).toBeNull();
});

test('returns null for a JSDoc with only @param/@returns and no summary text', () => {
    const node = firstStatement(`
        /**
         * @param date the date to format
         * @returns the formatted string
         */
        export function formatRelativeDate(date: Date) {}
    `);

    expect(jsdocSummary(node)).toBeNull();
});
