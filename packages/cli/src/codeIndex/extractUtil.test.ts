import { describe, expect, it } from 'bun:test';
import * as ts from 'typescript';

import { extractUtil } from './extractUtil.js';
import type { IndexSymbol } from './IndexSymbol.js';

function extract(source: string): IndexSymbol[] {
    const sourceFile = ts.createSourceFile('x.ts', source, ts.ScriptTarget.Latest, true);
    return extractUtil({
        sourceFile,
        packageName: '@acme/test',
        relPath: 'packages/test/src/x.ts',
        importPath: '@acme/test/x.js',
    });
}

describe('extractUtil', () => {
    it('extracts an exported function tagged @util with signature and description', () => {
        const symbols = extract(`
            /**
             * Formats a date relative to now.
             * @util
             */
            export function formatRelativeDate(date: Date, now: Date): string {
                return '';
            }
        `);

        expect(symbols).toEqual([
            {
                kind: 'util',
                packageName: '@acme/test',
                exportName: 'formatRelativeDate',
                importPath: '@acme/test/x.js',
                internalName: null,
                description: 'Formats a date relative to now.',
                signature: 'formatRelativeDate(date: Date, now: Date): string',
                relPath: 'packages/test/src/x.ts',
            },
        ]);
    });

    it('does not extract an exported function without the @util tag', () => {
        const symbols = extract(`
            /** Formats a date relative to now. */
            export function formatRelativeDate(date: Date): string {
                return '';
            }
        `);

        expect(symbols).toEqual([]);
    });

    it('does not treat @util mentioned only in prose as a tag', () => {
        const symbols = extract(`
            /** Companion to the @util helpers but not itself tagged. */
            export function notTagged(x: number): number {
                return x;
            }
        `);

        expect(symbols).toEqual([]);
    });

    it('extracts a const arrow function tagged @util', () => {
        const symbols = extract(`
            /**
             * Clamps a number.
             * @util
             */
            export const clamp = (value: number, min: number, max: number): number => value;
        `);

        expect(symbols).toMatchObject([
            {
                kind: 'util',
                exportName: 'clamp',
                description: 'Clamps a number.',
                signature: 'clamp(value: number, min: number, max: number): number',
            },
        ]);
    });

    it('extracts a const function expression tagged @util', () => {
        const symbols = extract(`
            /** @util */
            export const identity = function (value: number): number {
                return value;
            };
        `);

        expect(symbols).toMatchObject([
            { kind: 'util', exportName: 'identity', signature: 'identity(value: number): number' },
        ]);
    });

    it('omits the return type from the signature when there is no explicit return type', () => {
        const symbols = extract(`
            /** @util */
            export function noReturn(x: number) {}
        `);

        expect(symbols[0]?.signature).toBe('noReturn(x: number)');
    });

    it('does not extract a non-exported function even when tagged @util', () => {
        const symbols = extract(`
            /** @util */
            function internalHelper(x: number): number {
                return x;
            }
        `);

        expect(symbols).toEqual([]);
    });

    it('does not extract a const whose initializer is not a function', () => {
        const symbols = extract(`
            /** @util */
            export const notAFunction = 42;
        `);

        expect(symbols).toEqual([]);
    });

    it('does not throw on truncated/malformed source', () => {
        expect(() => extract(`export function broken(`)).not.toThrow();
        expect(() => extract(`/** @util */\nexport const x = (`)).not.toThrow();
    });
});
