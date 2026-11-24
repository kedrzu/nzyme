import { runInNewContext } from 'node:vm';

import { expect, test } from 'bun:test';

import { instrumentScript } from './instrumentScript.js';

/**
 * Each snippet runs as a sloppy-mode script (so a broken `'use strict'` directive shows) and its
 * completion value, awaited, is the result; instrumented and plain runs must agree.
 */
const snippets: Record<string, string> = {
    'expression-bodied arrows, object literal and sequence bodies': `
        const pair = (a, b) => ({ a, b });
        const last = (a, b) => (a, b);
        const curry = a => b => c => a + b + c;
        const cond = x => x in { k: 1 } ? 'in' : 'out';
        [pair(1, 2), last(1, 2), curry(1)(2)(3), cond('k'), cond('z')];
    `,
    'object methods, getters and setters with this': `
        const counter = {
            value: 1,
            inc() { this.value++; return this; },
            get double() { return this.value * 2; },
            set double(v) { this.value = v / 2; },
            arrowThis() { return [1, 2].map(x => x * this.value); },
        };
        counter.inc().inc();
        const before = counter.double;
        counter.double = 10;
        [before, counter.value, counter.arrowThis()];
    `,
    'classes: constructors calling super, static, private and accessor members, fields': `
        class Base { constructor(x) { this.x = x; } get kind() { return 'base'; } static make() { return new this(1); } }
        class Derived extends Base {
            #secret = () => this.x * 10;
            field = (() => this.x + 1)();
            static count = 0;
            static { Derived.count = [1, 2].map(n => n * 3).length; }
            constructor(x) { super(x * 2); Derived.count++; }
            get kind() { return 'derived:' + super.kind; }
            reveal() { return this.#secret(); }
        }
        const d = Derived.make();
        [d.x, d.field, d.kind, d.reveal(), Derived.count, d instanceof Base];
    `,
    'generators, generator methods and delegation': `
        function* range(n) { for (let i = 0; i < n; i++) yield i; return 'done'; }
        const holder = { *pairs() { yield* range(2); yield 'x'; } };
        const it = range(2);
        [[...range(3)], [...holder.pairs()], it.next(), it.next(), it.next()];
    `,
    'async functions, async arrows and async generators': `
        (async () => {
            async function twice(x) { await null; return x * 2; }
            const add = async (a, b) => (await a) + (await b);
            async function* ticks() { yield 1; await null; yield 2; }
            const collected = [];
            for await (const t of ticks()) collected.push(t);
            return [await twice(2), await add(Promise.resolve(1), 2), collected];
        })();
    `,
    'default parameters, arguments, length and name': `
        function withDefaults(a, b = a * 2, c = () => a + b) { return [a, b, c(), arguments.length]; }
        function rest(first, ...others) { return [first, others, arguments.length]; }
        const named = function inner() { return typeof inner; };
        [withDefaults(1), withDefaults(1, 5), rest(1, 2, 3), withDefaults.length, rest.length, withDefaults.name, named()];
    `,
    'directive prologues keep strict mode, with and without a semicolon': `
        function strict() { 'use strict'; return this === undefined; }
        function strictNoSemicolon() { 'use strict'
            return this === undefined; }
        function twoDirectives() { 'use strict'; 'another'; return this === undefined; }
        function sloppy() { return this === undefined; }
        function notADirective() { ('use strict'); return this === undefined; }
        [strict(), strictNoSemicolon(), twoDirectives(), sloppy(), notADirective()];
    `,
    'non-ASCII text before functions keeps offsets aligned': `
        const greeting = 'zażółć gęślą jaźń 😀';
        const length = () => greeting.length;
        const shout = s => s.toUpperCase();
        [length(), shout(greeting)];
    `,
    'closures, recursion and hoisting': `
        const result = hoisted(5);
        function hoisted(n) { return n <= 1 ? 1 : n * hoisted(n - 1); }
        function makeCounter() { let n = 0; return { next: () => ++n, reset() { n = 0; } }; }
        const c = makeCounter();
        c.next(); c.next();
        const mid = c.next();
        c.reset();
        [result, mid, c.next()];
    `,
};

for (const [name, code] of Object.entries(snippets)) {
    test(`instrumentation preserves semantics: ${name}`, async () => {
        const instrumented = instrumentScript({ code, filename: 'snippet.js', fileIdAt: () => 7 });
        if (instrumented === undefined) {
            throw new Error('snippet does not parse');
        }

        const hits: number[] = [];
        const plainResult = await runScript(code, { __nzymeTraceHit: () => undefined });
        const instrumentedResult = await runScript(instrumented, { __nzymeTraceHit: (id: number) => hits.push(id) });

        expect(instrumentedResult).toEqual(plainResult);
        expect(hits.length).toBeGreaterThan(0);
        expect(new Set(hits)).toEqual(new Set([7]));
    });
}

test('functions whose source is not traced get no probe call', () => {
    const code = 'const a = () => 1;\nfunction b() { return 2; }\n';
    const firstLineOnly = instrumentScript({
        code,
        filename: 'mixed.js',
        fileIdAt: offset => (offset < code.indexOf('\n') ? 1 : undefined),
    });

    expect(firstLineOnly).toBe('const a = () => (__nzymeTraceHit(1),1);\nfunction b() { return 2; }\n');
});

test('code that does not parse is reported, so the caller runs it unchanged', () => {
    expect(instrumentScript({ code: 'const f = () => {', filename: 'broken.js', fileIdAt: () => 0 })).toBeUndefined();
});

async function runScript(code: string, globals: Record<string, unknown>) {
    const result: unknown = await runInNewContext(code, { ...globals });
    const roundTripped: unknown = JSON.parse(JSON.stringify(result));
    return roundTripped;
}
