import { expect, test } from 'bun:test';

import { fingerprintPackageJson } from './fingerprintPackageJson.js';

const BASE = {
    name: '@acme/lib',
    version: '1.0.0',
    type: 'module',
    exports: { './*.js': { source: './src/*.ts', import: './dist/*.js' } },
    dependencies: { 'left-pad': '^1.0.0' },
    scripts: { build: 'tsgo --build' },
    devDependencies: { typescript: '^6.0.0' },
};

test('a version bump keeps the fingerprint', () => {
    expect(fingerprint({ ...BASE, version: '1.1.0' })).toBe(fingerprint(BASE));
});

test('a changed script or dev dependency keeps the fingerprint', () => {
    expect(fingerprint({ ...BASE, scripts: { build: 'tsc' } })).toBe(fingerprint(BASE));
    expect(fingerprint({ ...BASE, devDependencies: { typescript: '^7.0.0' } })).toBe(fingerprint(BASE));
});

test('a change to how the package loads changes the fingerprint', () => {
    expect(fingerprint({ ...BASE, exports: { './*.js': { import: './dist/*.js' } } })).not.toBe(fingerprint(BASE));
    // The order of export conditions decides which one matches.
    expect(fingerprint({ ...BASE, exports: { './*.js': { import: './dist/*.js', source: './src/*.ts' } } })).not.toBe(
        fingerprint(BASE),
    );
    expect(fingerprint({ ...BASE, type: 'commonjs' })).not.toBe(fingerprint(BASE));
    expect(fingerprint({ ...BASE, dependencies: { 'left-pad': '^1.1.0' } })).not.toBe(fingerprint(BASE));
});

test('a field the fingerprint does not know counts', () => {
    expect(fingerprint({ ...BASE, customLoader: './loader.js' })).not.toBe(fingerprint(BASE));
});

test('the order of top-level fields does not count', () => {
    const { name, ...rest } = BASE;
    expect(fingerprint({ ...rest, name })).toBe(fingerprint(BASE));
});

test('text that is not a JSON object has no fingerprint', () => {
    expect(fingerprintPackageJson('{ "name": ')).toBeNull();
    expect(fingerprintPackageJson('["@acme/lib"]')).toBeNull();
});

function fingerprint(manifest: Record<string, unknown>): string | null {
    return fingerprintPackageJson(JSON.stringify(manifest, null, 4));
}
