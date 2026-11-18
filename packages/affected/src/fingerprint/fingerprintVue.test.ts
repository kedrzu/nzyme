import { expect, test } from 'bun:test';

import { fingerprintVue } from './fingerprintVue.js';

const base = `<script lang="ts">
import { defineComponent } from 'vue';

export const SIZES = ['sm', 'lg'];

export function sizeClass(size: string) {
    return 'card_' + size;
}
</script>

<script setup lang="ts">
// Props of the card.
const props = defineProps<{ title: string }>();
const label = computed(() => props.title.toUpperCase());
</script>

<template>
    <div class="card">{{ label }}</div>
</template>

<style scoped>
.card { color: red; }
</style>
`;

test('template, script setup and style changes change only body', () => {
    expect(changedParts(base, base.replace('class="card"', 'class="panel"'))).toEqual(['body']);
    expect(changedParts(base, base.replace('toUpperCase', 'toLowerCase'))).toEqual(['body']);
    expect(changedParts(base, base.replace('color: red', 'color: blue'))).toEqual(['body']);
    expect(changedParts(base, base.replace('<style scoped>', '<style>'))).toEqual(['body']);
});

test('script setup types are runtime declarations, so they change body', () => {
    expect(changedParts(base, base.replace('title: string', 'title: number'))).toEqual(['body']);
});

test('comments and formatting in script setup change no hash', () => {
    const after = base
        .replace('// Props of the card.', '/* The card props. */')
        .replace('const label = computed(', 'const label =\n    computed(');
    expect(changedParts(base, after)).toEqual([]);
});

test('comments in a style block change no hash', () => {
    const scss = base.replace('<style scoped>', '<style scoped lang="scss">');
    expect(changedParts(scss, scss.replace('.card { color: red; }', '.card { color: red; } // note'))).toEqual([]);
    expect(changedParts(scss, scss.replace('color: red;', '/* why */ color: red;'))).toEqual([]);
    expect(changedParts(base, base.replace('color: red;', '/* why */ color: red;'))).toEqual([]);
});

test('comment markers in style strings and urls are content', () => {
    const scss = base.replace('<style scoped>', '<style scoped lang="scss">');
    const withUrl = scss.replace('color: red;', 'background: url(http://a/b.png);');
    expect(changedParts(withUrl, withUrl.replace('http://a/b.png', 'http://a/c.png'))).toEqual(['body']);

    const withQuotedUrl = scss.replace('color: red;', 'background: url("//cdn/a.png");');
    expect(changedParts(withQuotedUrl, withQuotedUrl.replace('//cdn/a.png', '//cdn/b.png'))).toEqual(['body']);

    const withContent = scss.replace('color: red;', 'content: "//x";');
    expect(changedParts(withContent, withContent.replace('"//x"', '"//y"'))).toEqual(['body']);

    const withOpener = scss.replace('color: red; }', "content: '/*'; color: red; } /* end */");
    expect(changedParts(withOpener, withOpener.replace('color: red', 'color: blue'))).toEqual(['body']);
});

test('// is not a comment in a plain CSS style block', () => {
    const withSlashes = base.replace('color: red;', 'color: red; //x');
    expect(changedParts(withSlashes, withSlashes.replace('//x', '//y'))).toEqual(['body']);
});

test('a plain script is split like a module', () => {
    expect(changedParts(base, base.replace("'card_'", "'panel_'"))).toEqual(['body']);
    expect(changedParts(base, base.replace("['sm', 'lg']", "['sm', 'md', 'lg']"))).toEqual(['top']);
    expect(changedParts(base, base.replace('size: string', 'size: string | number'))).toEqual([]);
});

test('an SFC with a block that does not parse is whole', () => {
    expect(fingerprintVue('Card.vue', base.replace("export const SIZES = ['sm', 'lg'];", 'export const = ;'))).toBe(
        'whole',
    );
    expect(fingerprintVue('Card.vue', base.replace('const label =', 'const label = = '))).toBe('whole');
    expect(fingerprintVue('Card.vue', '<template><div></template>')).toBe('whole');
});

/** Which parts of the fingerprint differ between two versions of the SFC; `whole` if either is unsplit. */
function changedParts(before: string, after: string) {
    const a = fingerprintVue('Card.vue', before);
    const b = fingerprintVue('Card.vue', after);
    if (a === 'whole' || b === 'whole') {
        return ['whole'];
    }

    const parts: string[] = [];
    if (a.body !== b.body) {
        parts.push('body');
    }
    if (a.top !== b.top) {
        parts.push('top');
    }
    return parts;
}
