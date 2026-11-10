import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'bun:test';

import type { Package } from '../getPackages.js';
import type { ImportSpecifier, ImportSpecifierKind } from './extractImportSpecifiers.js';
import { createImportResolver, resolveRelativeSpecifier } from './resolveImportTarget.js';

const root = '/repo';

/** The resolver `arch check` used before it moved onto {@link resolveRelativeSpecifier}. */
function archResolveRelativeImport(fromFile: string, specifier: string, fileSet: Set<string>): string | null {
    const base = resolve(dirname(fromFile), specifier).replace(/\.(js|ts|tsx)$/, '');
    const candidates = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')];
    return candidates.find(candidate => fileSet.has(candidate)) ?? null;
}

function spec(specifier: string, kind: ImportSpecifierKind = 'module'): ImportSpecifier {
    return { specifier, typeOnly: false, kind };
}

describe('resolveRelativeSpecifier', () => {
    it('matches the arch resolver exactly on a set of .ts/.tsx files', () => {
        const fileSet = new Set(
            [
                'src/a.ts',
                'src/both.ts',
                'src/both.tsx',
                'src/comp.tsx',
                'src/dir/index.ts',
                'src/tsxdir/index.tsx',
                'src/dir.tsx',
                'src/nested/deep.ts',
                'parent.ts',
                'parent/index.ts',
            ].map(file => `${root}/${file}`),
        );
        const from = `${root}/src/nested/from.ts`;
        const specifiers = [
            '../a.js',
            '../a.ts',
            '../a',
            '../both.js',
            '../both.tsx',
            '../comp.jsx',
            '../comp.js',
            '../dir',
            '../dir/',
            '../dir/index.js',
            '../tsxdir',
            './deep.js',
            '../../parent',
            '../../parent/',
            '../missing.js',
            '../a.json',
            '../a.mjs',
            '../comp.tsx',
            '.',
            '..',
        ];

        for (const specifier of specifiers) {
            expect([specifier, resolveRelativeSpecifier(from, specifier, fileSet)]).toEqual([
                specifier,
                archResolveRelativeImport(from, specifier, fileSet),
            ]);
        }
    });

    it('works with root-relative paths', () => {
        const paths = new Set(['src/a.ts', 'src/dir/index.tsx']);

        expect(resolveRelativeSpecifier('src/b.ts', './a.js', paths)).toBe('src/a.ts');
        expect(resolveRelativeSpecifier('src/sub/c.ts', '../dir', paths)).toBe('src/dir/index.tsx');
        expect(resolveRelativeSpecifier('src/b.ts', './missing.js', paths)).toBeNull();
    });

    it('tries only the TypeScript candidates', () => {
        const paths = new Set(['src/data.json', 'src/Comp.tsx', 'src/legacy.js']);

        expect(resolveRelativeSpecifier('src/b.ts', './data.json', paths)).toBeNull();
        expect(resolveRelativeSpecifier('src/b.ts', './Comp.jsx', paths)).toBeNull();
        expect(resolveRelativeSpecifier('src/b.ts', './legacy.js', paths)).toBeNull();
    });
});

describe('createImportResolver', () => {
    const packages: Package[] = [
        {
            path: `${root}/packages/common`,
            packageJson: {
                name: '@acme/common',
                exports: {
                    '.': { types: './dist/index.d.ts', source: './src/index.ts', import: './dist/index.js' },
                    './*.js': { types: './dist/*.d.ts', source: './src/*.ts', import: './dist/*.js' },
                    './special': { source: './src/special/entry.ts' },
                    './shims': { types: './src/shims.d.ts' },
                    './package.json': './package.json',
                },
            },
        },
        {
            path: `${root}/packages/ui`,
            packageJson: {
                name: '@acme/ui',
                exports: { './*.js': './src/*.ts', './*.vue': './src/*.vue', './styles/*': './src/styles/*' },
            },
        },
        {
            path: `${root}/packages/stylebook`,
            packageJson: { name: '@acme/stylebook', exports: { './index.scss': './src/index.scss' } },
        },
        { path: `${root}/packages/app`, packageJson: { name: '@acme/app' } },
        { path: `${root}/packages/other-app`, packageJson: { name: '@acme/other-app' } },
    ];
    const paths = new Set([
        'packages/common/src/index.ts',
        'packages/common/src/foo/bar.ts',
        'packages/common/src/special/entry.ts',
        'packages/common/src/shims.d.ts',
        'packages/common/package.json',
        'packages/ui/src/Button.vue',
        'packages/ui/src/useThing.ts',
        'packages/ui/src/styles/colors.scss',
        'packages/stylebook/src/index.scss',
        'packages/app/components/Page.vue',
        'packages/app/utils/format.ts',
        'packages/app/styles/_colors.scss',
        'packages/app/styles/_mixins.scss',
        'packages/app/styles/theme/_index.scss',
        'packages/app/styles/main.scss',
        'packages/app/fixtures/one.json',
        'packages/app/fixtures/nested/two.txt',
        'packages/app/fixtures-other/three.json',
        'packages/other-app/utils/format.ts',
    ]);
    const resolver = createImportResolver({
        root,
        packages,
        aliases: [{ prefix: '@/', packages: ['@acme/app'] }],
        paths,
    });

    function resolveFrom(from: string, specifier: ImportSpecifier): string[] {
        return resolver.resolve(from, specifier);
    }

    it('resolves package exports through the `source` condition and `*` patterns', () => {
        const from = 'packages/app/utils/format.ts';

        expect(resolveFrom(from, spec('@acme/common'))).toEqual(['packages/common/src/index.ts']);
        expect(resolveFrom(from, spec('@acme/common/foo/bar.js'))).toEqual(['packages/common/src/foo/bar.ts']);
        expect(resolveFrom(from, spec('@acme/common/special'))).toEqual(['packages/common/src/special/entry.ts']);
    });

    it('resolves plain string export targets that point at sources', () => {
        const from = 'packages/app/utils/format.ts';

        expect(resolveFrom(from, spec('@acme/ui/Button.vue'))).toEqual(['packages/ui/src/Button.vue']);
        expect(resolveFrom(from, spec('@acme/ui/useThing.js'))).toEqual(['packages/ui/src/useThing.ts']);
    });

    it('resolves nothing for unexported subpaths, entries without a source, externals and virtual modules', () => {
        const from = 'packages/app/utils/format.ts';

        for (const specifier of [
            '@acme/common/foo/bar', // no `./*` key without the `.js` suffix
            '@acme/common/shims', // `types` only
            '@acme/common/missing.js', // exported pattern, but no such source file
            '@acme/app/utils/format.js', // package without `exports`
            'vue',
            '@vue/runtime-core',
            '#app',
            '#components',
            '#imports',
            'node:fs',
        ]) {
            expect([specifier, resolveFrom(from, spec(specifier))]).toEqual([specifier, []]);
        }
    });

    it('resolves an alias only inside the packages that declare it', () => {
        expect(resolveFrom('packages/app/components/Page.vue', spec('@/utils/format.js'))).toEqual([
            'packages/app/utils/format.ts',
        ]);
        expect(resolveFrom('packages/other-app/utils/format.ts', spec('@/utils/format.js'))).toEqual([]);
    });

    it('never resolves to a same-named file in another directory or package', () => {
        expect(resolveFrom('packages/other-app/utils/index.ts', spec('./format.js'))).toEqual([
            'packages/other-app/utils/format.ts',
        ]);
        expect(resolveFrom('packages/app/components/Page.vue', spec('./format.js'))).toEqual([]);
        expect(resolveFrom('packages/app/components/Page.vue', spec('../../other-app/utils/format.js'))).toEqual([
            'packages/other-app/utils/format.ts',
        ]);
    });

    it('resolves a url to a file, or to every file under a directory', () => {
        const from = 'packages/app/utils/format.ts';

        expect(resolveFrom(from, spec('../fixtures/one.json', 'url'))).toEqual(['packages/app/fixtures/one.json']);
        expect(resolveFrom(from, spec('../fixtures/', 'url'))).toEqual([
            'packages/app/fixtures/nested/two.txt',
            'packages/app/fixtures/one.json',
        ]);
        expect(resolveFrom(from, spec('../fixtures', 'url'))).toEqual([
            'packages/app/fixtures/nested/two.txt',
            'packages/app/fixtures/one.json',
        ]);
        expect(resolveFrom(from, spec('https://example.com/x.json', 'url'))).toEqual([]);
        expect(resolveFrom(from, spec('../missing', 'url'))).toEqual([]);
    });

    it('resolves Sass partials, index files, aliases and package exports', () => {
        const from = 'packages/app/styles/main.scss';

        expect(resolveFrom(from, spec('colors', 'sass'))).toEqual(['packages/app/styles/_colors.scss']);
        expect(resolveFrom(from, spec('./mixins', 'sass'))).toEqual(['packages/app/styles/_mixins.scss']);
        expect(resolveFrom(from, spec('_mixins.scss', 'sass'))).toEqual(['packages/app/styles/_mixins.scss']);
        expect(resolveFrom(from, spec('mixins.scss', 'sass'))).toEqual(['packages/app/styles/_mixins.scss']);
        expect(resolveFrom(from, spec('theme', 'sass'))).toEqual(['packages/app/styles/theme/_index.scss']);
        expect(resolveFrom(from, spec('@/styles/colors', 'sass'))).toEqual(['packages/app/styles/_colors.scss']);
        expect(resolveFrom(from, spec('@acme/stylebook/index.scss', 'sass'))).toEqual([
            'packages/stylebook/src/index.scss',
        ]);
        expect(resolveFrom(from, spec('@acme/ui/styles/colors.scss', 'sass'))).toEqual([
            'packages/ui/src/styles/colors.scss',
        ]);
        expect(resolveFrom(from, spec('sass:math', 'sass'))).toEqual([]);
    });

    it('resolves relative imports of non-TS files, `.jsx`, `.mjs` and bundler queries', () => {
        const from = 'src/b.ts';
        const extended = createImportResolver({
            root,
            packages,
            paths: new Set([
                'src/Page.module.scss',
                'src/data.json',
                'src/Comp.vue',
                'src/useInput.tsx',
                'src/esm.mts',
                'src/legacy.js',
                'src/types.d.ts',
                'src/icon.svg',
            ]),
        });

        expect(extended.resolve(from, spec('./Page.module.scss'))).toEqual(['src/Page.module.scss']);
        expect(extended.resolve(from, spec('./data.json'))).toEqual(['src/data.json']);
        expect(extended.resolve(from, spec('./Comp.vue'))).toEqual(['src/Comp.vue']);
        expect(extended.resolve(from, spec('./useInput.jsx'))).toEqual(['src/useInput.tsx']);
        expect(extended.resolve(from, spec('./esm.mjs'))).toEqual(['src/esm.mts']);
        expect(extended.resolve(from, spec('./legacy.js'))).toEqual(['src/legacy.js']);
        expect(extended.resolve(from, spec('./types.js'))).toEqual(['src/types.d.ts']);
        expect(extended.resolve(from, spec('./icon.svg?component'))).toEqual(['src/icon.svg']);
    });
});
