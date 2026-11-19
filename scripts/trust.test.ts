import { describe, expect, it } from 'bun:test';

import { readRegistryToken } from './trust.js';

describe('readRegistryToken', () => {
    it('reads the npmjs.org token among other settings', () => {
        const npmrc =
            '//npm.pkg.github.com/:_authToken=other\n//registry.npmjs.org/:_authToken=npm_secret\nsave-exact=true\n';

        expect(readRegistryToken(npmrc)).toBe('npm_secret');
    });

    it('reads nothing when there is no npmjs.org token', () => {
        expect(readRegistryToken('save-exact=true\n')).toBeNull();
    });
});
