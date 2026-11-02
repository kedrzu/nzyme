import { describe, expect, it } from 'bun:test';

import { checkDependencyRanges, readWorkspacePackages } from './publish.js';
import type { WorkspacePackage } from './publish.js';

function createPackage(overrides: Partial<WorkspacePackage['specifiers']>, isPrivate = false): WorkspacePackage {
    return {
        dir: '/pkg',
        name: '@test/pkg',
        version: '1.0.0',
        private: isPrivate,
        specifiers: {
            dependencies: {},
            peerDependencies: {},
            optionalDependencies: {},
            devDependencies: {},
            ...overrides,
        },
    };
}

describe('checkDependencyRanges', () => {
    it('rejects an exact pin and a peer/dev mismatch in a public package', () => {
        const problems = checkDependencyRanges([
            createPackage({
                dependencies: { zod: '4.1.0' },
                peerDependencies: { vue: '^3.5.0' },
                devDependencies: { vue: '3.5.13' },
            }),
        ]);

        expect(problems).toEqual([
            '@test/pkg dependencies: zod is pinned to 4.1.0',
            '@test/pkg devDependencies: vue is 3.5.13 but its peerDependencies range is ^3.5.0',
        ]);
    });

    it('accepts ranges, workspace:, npm: and a private package with exact pins', () => {
        const problems = checkDependencyRanges([
            createPackage({
                dependencies: { zod: '^4.1.0', '@nzyme/utils': 'workspace:*', alias: 'npm:zod@^4.0.0' },
                peerDependencies: { vue: '^3.5.0' },
                devDependencies: { vue: '^3.5.0', vitest: '3.0.0' },
            }),
            createPackage({ dependencies: { zod: '4.1.0' } }, true),
        ]);

        expect(problems).toEqual([]);
    });
});

describe('workspace manifests', () => {
    it('declare ranges, not exact pins, in every public package', async () => {
        const packages = await readWorkspacePackages();

        expect(packages.length).toBeGreaterThan(0);
        expect(checkDependencyRanges(packages)).toEqual([]);
    });
});
