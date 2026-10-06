import { describe, expect, it } from 'bun:test';

import { importPathOf } from './importPathOf.js';

describe('importPathOf', () => {
    it('strips a leading src/ and turns .ts into .js', () => {
        expect(
            importPathOf({
                packageName: '@acme/payments',
                packageDir: '/repo/packages/payments',
                filePath: '/repo/packages/payments/src/PaymentClient.ts',
            }),
        ).toBe('@acme/payments/PaymentClient.js');
    });

    it('turns .tsx into .js', () => {
        expect(
            importPathOf({
                packageName: '@acme/ui',
                packageDir: '/repo/packages/ui',
                filePath: '/repo/packages/ui/src/Button.tsx',
            }),
        ).toBe('@acme/ui/Button.js');
    });

    it('preserves a .vue extension', () => {
        expect(
            importPathOf({
                packageName: '@acme/ui',
                packageDir: '/repo/packages/ui',
                filePath: '/repo/packages/ui/src/Button.vue',
            }),
        ).toBe('@acme/ui/Button.vue');
    });

    it('keeps nested paths under src', () => {
        expect(
            importPathOf({
                packageName: '@acme/backend',
                packageDir: '/repo/packages/backend',
                filePath: '/repo/packages/backend/src/chat/ChatStartCommand.ts',
            }),
        ).toBe('@acme/backend/chat/ChatStartCommand.js');
    });

    it('leaves a path without a leading src/ untouched', () => {
        expect(
            importPathOf({
                packageName: '@acme/backend',
                packageDir: '/repo/packages/backend',
                filePath: '/repo/packages/backend/chat/Loose.ts',
            }),
        ).toBe('@acme/backend/chat/Loose.js');
    });
});
