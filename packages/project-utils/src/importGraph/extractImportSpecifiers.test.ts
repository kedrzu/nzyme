import { describe, expect, it } from 'bun:test';

import { extractEsmSpecifiers, extractImplicitSpecifiers } from './extractImportSpecifiers.js';

function names(specifiers: Array<{ specifier: string }>): string[] {
    return specifiers.map(s => s.specifier).toSorted();
}

describe('extractEsmSpecifiers', () => {
    it('finds static, re-export, side-effect and dynamic imports', () => {
        const content = [
            `import { a } from './a.js';`,
            `import b, { c } from "../b.js";`,
            `import * as ns from '@acme/ns';`,
            `export { d } from './d.js';`,
            `export * from './e.js';`,
            `import './side-effect.js';`,
            `const lazy = await import('./lazy.js');`,
            `import {\n    multi,\n    line,\n} from './multi.js';`,
        ].join('\n');

        expect(names(extractEsmSpecifiers(content))).toEqual([
            '../b.js',
            './a.js',
            './d.js',
            './e.js',
            './lazy.js',
            './multi.js',
            './side-effect.js',
            '@acme/ns',
        ]);
        expect(extractEsmSpecifiers(content).every(s => s.kind === 'module' && !s.typeOnly)).toBe(true);
    });

    it('marks `import type` and `export type` as type-only', () => {
        const specifiers = extractEsmSpecifiers(
            [
                `import type { A } from './a.js';`,
                `export type { B } from './b.js';`,
                `import { type C } from './c.js';`,
            ].join('\n'),
        );

        expect(specifiers.map(s => [s.specifier, s.typeOnly])).toEqual([
            ['./a.js', true],
            ['./b.js', true],
            // An inline `type` modifier still loads the module.
            ['./c.js', false],
        ]);
    });

    it('ignores imports inside comments and JSDoc but keeps string literals', () => {
        const content = [
            `/**`,
            ` * @example`,
            ` * import { x } from './in-jsdoc.js';`,
            ` */`,
            `// import { y } from './in-line-comment.js';`,
            `/* export * from './in-block-comment.js'; */`,
            `const url = 'https://example.com/a'; import { z } from './real.js';`,
        ].join('\n');

        expect(names(extractEsmSpecifiers(content))).toEqual(['./real.js']);
    });
});

describe('extractImplicitSpecifiers', () => {
    it('script: finds `new URL(literal, import.meta.url)` as url specifiers', () => {
        const content = [
            `const file = new URL('./fixture.json', import.meta.url);`,
            `const dir = new URL("../fixtures/", import.meta.url);`,
            'const tpl = new URL(`./template.txt`, import.meta.url);',
            'const dynamic = new URL(`./${name}.txt`, import.meta.url);',
            `const other = new URL('./not-relative-to-module', base);`,
            `// new URL('./commented.json', import.meta.url)`,
        ].join('\n');

        const specifiers = extractImplicitSpecifiers(content, 'script');
        expect(names(specifiers)).toEqual(['../fixtures/', './fixture.json', './template.txt']);
        expect(specifiers.every(s => s.kind === 'url')).toBe(true);
    });

    it('vue: finds script-block imports, src attributes and scss style imports, not template text', () => {
        const content = [
            `<script setup lang="ts">`,
            `import Child from './Child.vue';`,
            `import type { Props } from './props.js';`,
            `const icon = new URL('./icon.svg', import.meta.url);`,
            `</script>`,
            `<script lang="ts">export * from './shared.js';</script>`,
            `<template>`,
            `  <p>To use it, import foo from 'bar' in your code.</p>`,
            `</template>`,
            `<template src="./Widget.html"></template>`,
            `<script src="./external.ts"></script>`,
            `<style lang="scss" module="css" src="./Widget.module.scss" />`,
            `<style lang="scss" scoped>`,
            `@use '@/styles/colors' as c;`,
            `</style>`,
            `<!-- <script src="./commented.ts"></script> -->`,
        ].join('\n');

        const specifiers = extractImplicitSpecifiers(content, 'vue');
        expect(specifiers.map(s => [s.specifier, s.kind, s.typeOnly])).toEqual([
            ['./Child.vue', 'module', false],
            ['./props.js', 'module', true],
            ['./icon.svg', 'url', false],
            ['./shared.js', 'module', false],
            ['./Widget.html', 'module', false],
            ['./external.ts', 'module', false],
            ['./Widget.module.scss', 'module', false],
            ['@/styles/colors', 'sass', false],
        ]);
    });

    it('scss: finds @use, @forward and every @import target, skipping url() and comments', () => {
        const content = [
            `@use 'sass:math';`,
            `@use "colors" as c with ($primary: 'red');`,
            `@forward 'spacing' show gap;`,
            `@import 'reset', "../shared/typography";`,
            `@import url('https://fonts.example.com/font.css');`,
            `// @use 'commented';`,
            `/* @forward 'block-commented'; */`,
        ].join('\n');

        const specifiers = extractImplicitSpecifiers(content, 'scss');
        expect(names(specifiers)).toEqual(['../shared/typography', 'colors', 'reset', 'sass:math', 'spacing']);
        expect(specifiers.every(s => s.kind === 'sass')).toBe(true);
    });
});
