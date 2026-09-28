import { describe, expect, it } from 'bun:test';

import { scanExportAnnotation } from './scanExportAnnotation.js';

describe('scanExportAnnotation', () => {
    it('finds the annotation in a JSDoc block before an exported function', () => {
        const source = `/**
 * Adds one.
 * @__NO_SIDE_EFFECTS__
 */
export function pure(value: number): number {
    return value + 1;
}
`;

        expect(scanExportAnnotation(source, 'pure')).toEqual({ kind: 'annotated' });
    });

    it('reports the same declaration without the annotation as absent', () => {
        const source = `/** Adds one. */
export function pure(value: number): number {
    return value + 1;
}
`;

        expect(scanExportAnnotation(source, 'pure')).toEqual({ kind: 'absent' });
    });

    it('finds the annotation stacked in a second comment block', () => {
        const source = `/** Adds one. */
/** @__NO_SIDE_EFFECTS__ */
export function pure(value: number): number {
    return value + 1;
}
`;

        expect(scanExportAnnotation(source, 'pure')).toEqual({ kind: 'annotated' });
    });

    it('finds the annotation in a line comment', () => {
        const source = `// @__NO_SIDE_EFFECTS__
export function pure(value: number): number {
    return value + 1;
}
`;

        expect(scanExportAnnotation(source, 'pure')).toEqual({ kind: 'annotated' });
    });

    it('finds the annotation on a const declaration, where the JSDoc precedes the whole statement', () => {
        const source = `/**
 * Adds one.
 * @__NO_SIDE_EFFECTS__
 */
export const pure = (value: number): number => value + 1;
`;

        expect(scanExportAnnotation(source, 'pure')).toEqual({ kind: 'annotated' });
    });

    it('does not carry an annotation over from a neighbouring declaration', () => {
        const source = `/**
 * Adds one.
 * @__NO_SIDE_EFFECTS__
 */
export function pure(value: number): number {
    return value + 1;
}

export function plain(value: number): number {
    return value + 2;
}
`;

        expect(scanExportAnnotation(source, 'plain')).toEqual({ kind: 'absent' });
    });

    it('ignores a nested declaration that shares the name', () => {
        const source = `export function wrapper(): number {
    /**
     * @__NO_SIDE_EFFECTS__
     */
    const pure = (value: number): number => value + 1;
    return pure(1);
}
`;

        expect(scanExportAnnotation(source, 'pure')).toEqual({ kind: 'absent' });
    });

    it('hands back the aliased origin of a named re-export', () => {
        const source = `export { pure as reexported } from './helpers.js';\n`;

        expect(scanExportAnnotation(source, 'reexported')).toEqual({
            kind: 'reexport',
            hops: [{ specifier: './helpers.js', exportName: 'pure' }],
        });
    });

    it('hands back every starred module, because none of them can be ruled out', () => {
        const source = `export * from './helpers.js';\nexport * from './more.js';\n`;

        expect(scanExportAnnotation(source, 'pure')).toEqual({
            kind: 'reexport',
            hops: [
                { specifier: './helpers.js', exportName: 'pure' },
                { specifier: './more.js', exportName: 'pure' },
            ],
        });
    });

    it('ignores a type-only re-export, which can never be a call', () => {
        const source = `export type { Pure } from './helpers.js';\n`;

        expect(scanExportAnnotation(source, 'Pure')).toEqual({ kind: 'absent' });
    });

    it('reports a name the module never mentions as absent', () => {
        const source = `export function other(): number {\n    return 1;\n}\n`;

        expect(scanExportAnnotation(source, 'pure')).toEqual({ kind: 'absent' });
    });
});
