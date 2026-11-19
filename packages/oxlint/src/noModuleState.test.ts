import { basename } from 'node:path';

import { describe, expect, it } from 'bun:test';

import type { OxlintJsonDiagnostic } from './oxlintTestHarness.js';
import { PLUGIN_PATH, lineOf, useOxlintHarness } from './oxlintTestHarness.js';

/**
 * End-to-end over the real `oxlint` binary and the built plugin, for the reasons given in
 * `noUnusedNoSideEffectsResult.test.ts`. Each case writes the module under test as `case.ts`
 * and asserts the exact lines reported, so an allowed line wrongly reported fails as loudly as a
 * rejected one let through.
 */
const RULE_CODE = 'nzyme(no-module-state)';

const { lint } = useOxlintHarness({
    config: {
        jsPlugins: [PLUGIN_PATH],
        rules: {
            'nzyme/no-module-state': ['error', { externalPackages: ['zod', 'vue#defineComponent'] }],
        },
    },
    ruleCode: RULE_CODE,
});

/** A module declaring `define` with the annotation and `plain` without it. */
const FACTORIES = `/**
 * Builds a definition.
 * @__NO_SIDE_EFFECTS__
 */
export function define<T>(value: T): T {
    return value;
}

/** The same shape, deliberately not annotated. */
export function plain<T>(value: T): T {
    return value;
}
`;

describe('nzyme/no-module-state', () => {
    it('allows functions, primitives and values that only read other bindings', async () => {
        const source = `import { define } from './factories.js';

export function declared(): number {
    return 1;
}
export const arrow = (value: number) => value + 1;
export const expression = function (value: number) {
    return value;
};
export const NAME = 'name';
export const LIMIT = 10 * 2;
export const ENABLED = !false;
export const GREETING = \`hello \${NAME}\`;
export const ALIAS = arrow;
export const KEY = Symbol('key');
export const SHARED_KEY = Symbol.for('shared');
export type Shape = { name: string };
export interface Other {
    id: number;
}
export enum Kind {
    A,
    B,
}
`;

        expect(await lintCase(source, { 'factories.ts': FACTORIES })).toEqual([]);
    });

    it('allows a value made immutable by `as const`, `Object.freeze` or a declared readonly type', async () => {
        const source = `import type { Immutable } from '@nzyme/types/Immutable.js';

export const LIST = ['a', 'b'] as const;
export const DEEP = { a: 1, nested: { b: [2] } } as const;
export const DEEP_TYPED: Immutable<{ nested: { b: number[] } }> = { nested: { b: [2] } };
export const OBJECT = Object.freeze({ a: 1, nested: Object.freeze({ b: [2] as const }) });
export const FROZEN_DEEP = Object.freeze({ nested: { b: [2] } }) as const;
export const GROUPS: ReadonlyMap<string, readonly string[]> = new Map([['a', ['x'] as const]]);
export const NAMES: ReadonlySet<string> = new Set(['a']);
export const BY_ID: ReadonlyMap<string, number> = new Map([['a', 1]]);
export const ITEMS: readonly string[] = ['a'];
export const ITEMS_ARRAY: ReadonlyArray<string> = ['a'];
export const CONFIG: Readonly<{ a: number }> = { a: 1 };
export const FROM_ENTRIES: Readonly<Record<string, number>> = Object.fromEntries([['a', 1]]);
`;

        expect(await lintCase(source)).toEqual([]);
    });

    it('rejects `let` and `var`', async () => {
        const source = `export let counter = 0;
export var legacy = 'x';
`;

        expect(await lintCase(source)).toEqual([
            lineOf(source, 'export let counter'),
            lineOf(source, 'export var legacy'),
        ]);
    });

    it('rejects a mutable collection, object or array without a readonly declared type', async () => {
        const source = `export const CACHE = new Map<string, number>();
export const SEEN = new Set<string>();
export const BY_OBJECT = new WeakMap<object, number>();
export const MARKED = new WeakSet<object>();
export const STATE = { count: 0 };
export const QUEUE: string[] = [];
export const TYPED: Record<string, number> = {};
export const ENTRIES = Object.fromEntries([['a', 1]]);
export const RECORD: Readonly<Record<string, Map<string, number>>> = { a: new WeakMap() as never };
`;

        expect(await lintCase(source)).toEqual([
            lineOf(source, 'export const CACHE'),
            lineOf(source, 'export const SEEN'),
            lineOf(source, 'export const BY_OBJECT'),
            lineOf(source, 'export const MARKED'),
            lineOf(source, 'export const STATE'),
            lineOf(source, 'export const QUEUE'),
            lineOf(source, 'export const TYPED'),
            lineOf(source, 'export const ENTRIES'),
            lineOf(source, 'export const RECORD'),
        ]);
    });

    it('rejects a literal nested in a value `Object.freeze` or a readonly type makes immutable only at the top', async () => {
        const source = `export const FROZEN = Object.freeze({ a: 1, nested: { b: 2 } });
export const CONFIG: Readonly<{ items: string[] }> = { items: [] };
export const ITEMS: readonly string[][] = [['a']];
export const GROUPS: ReadonlyMap<string, string[]> = new Map([['a', ['x']]]);
export const TAGS: ReadonlySet<{ id: number }> = new Set([{ id: 1 }]);
`;

        expect(await lintCase(source)).toEqual([
            lineOf(source, 'export const FROZEN'),
            lineOf(source, 'export const CONFIG'),
            lineOf(source, 'export const ITEMS'),
            lineOf(source, 'export const GROUPS'),
            lineOf(source, 'export const TAGS'),
        ]);
    });

    it('rejects code that runs when the module loads, a write to `globalThis` included', async () => {
        const source = `'use strict';
declare global {
    var registry: string[] | undefined;
}
globalThis.registry = [];
if (process.env.CI) {
    console.log('ci');
}
export {};
`;

        expect(await lintCase(source)).toEqual([
            lineOf(source, 'globalThis.registry = []'),
            lineOf(source, 'if (process.env.CI)'),
        ]);
    });

    it('rejects a static class field that is not readonly, and a static block', async () => {
        const source = `export class Registry {
    static instances = 0;
    static readonly NAME = 'registry';
    static readonly ITEMS = ['a'];
    static {
        Registry.instances = 1;
    }
    count = 0;
}
`;

        expect(await lintCase(source)).toEqual([
            lineOf(source, 'static instances'),
            lineOf(source, "static readonly ITEMS = ['a']"),
            lineOf(source, 'static {'),
        ]);
    });

    it('allows a call only when the declaration in the same module is annotated', async () => {
        const source = `${FACTORIES}
/**
 * Overloaded; the annotation sits on the implementation.
 */
export function overloaded(value: string): string;
export function overloaded(value: number): number;
/**
 * @__NO_SIDE_EFFECTS__
 */
export function overloaded(value: string | number) {
    return value;
}

export const DEFINED = define({ a: 1 });
export const OVERLOADED = overloaded('a');
export const PLAIN = plain({ a: 1 });
`;

        expect(await lintCase(source)).toEqual([lineOf(source, 'export const PLAIN')]);
    });

    it('reads the annotation from an imported declaration, through re-exports and a namespace', async () => {
        const source = `import { define, plain } from './barrel.js';
import { defineAlias } from './aliased.js';
import * as factories from './factories.js';

export const VIA_BARREL = define({ a: 1 });
export const VIA_ALIAS = defineAlias({ a: 1 });
export const VIA_NAMESPACE = factories.define({ a: 1 });
export const NOT_ANNOTATED = plain({ a: 1 });
export const NOT_ANNOTATED_IN_NAMESPACE = factories.plain({ a: 1 });
`;

        const findings = await lintCase(source, {
            'factories.ts': FACTORIES,
            'barrel.ts': "export * from './factories.js';\n",
            'aliased.ts': "export { define as defineAlias } from './factories.js';\n",
        });

        expect(findings).toEqual([
            lineOf(source, 'export const NOT_ANNOTATED ='),
            lineOf(source, 'export const NOT_ANNOTATED_IN_NAMESPACE'),
        ]);
    });

    it("follows a workspace package's bare specifier to its source through the `source` export condition", async () => {
        const source = `import { define, plain } from '@acme/lib/factories.js';

export const DEFINED = define({ a: 1 });
export const PLAIN = plain({ a: 1 });
`;

        const findings = await lintCase(source, {
            'node_modules/@acme/lib/package.json': JSON.stringify({
                name: '@acme/lib',
                exports: { './*.js': { source: './src/*.ts', default: './dist/*.js' } },
            }),
            'node_modules/@acme/lib/src/factories.ts': FACTORIES,
        });

        expect(findings).toEqual([lineOf(source, 'export const PLAIN')]);
    });

    it('allows calls into a listed external package, member and curried chains included, and narrows a `pkg#name` entry', async () => {
        const source = `import { z } from 'zod';
import { defineComponent, ref } from 'vue';
import { debounce } from 'lodash';

export const SCHEMA = z.object({ name: z.string().min(1) }).strict();
export const SUBPATH = z.string();
export const COMPONENT = defineComponent({});
export const STATE = ref(0);
export const DEBOUNCED = debounce(() => {}, 100);
export const CURRIED = z.custom<string>()('curried');
export const CURRIED_STATE = debounce(() => {}, 100)();
`;

        expect(await lintCase(source)).toEqual([
            lineOf(source, 'export const STATE'),
            lineOf(source, 'export const DEBOUNCED'),
            lineOf(source, 'export const CURRIED_STATE'),
        ]);
    });

    it('judges only the outermost call: its arguments are inputs, not state of their own', async () => {
        const source = `import { define, plain } from './factories.js';

export const NESTED = define({ schema: plain({ a: 1 }), list: [new Map()] });
export const OUTER = plain(define({ a: 1 }));
`;

        expect(await lintCase(source, { 'factories.ts': FACTORIES })).toEqual([lineOf(source, 'export const OUTER')]);
    });
});

/** Lints `source` as `case.ts` beside `files`, and returns the lines reported in `case.ts`. */
async function lintCase(source: string, files: Record<string, string> = {}): Promise<number[]> {
    const diagnostics = await lint({ ...files, 'case.ts': source });
    return diagnostics.filter(isInCase).map(diagnostic => diagnostic.labels[0]!.span.line);
}

function isInCase(diagnostic: OxlintJsonDiagnostic): boolean {
    return basename(diagnostic.filename) === 'case.ts';
}
