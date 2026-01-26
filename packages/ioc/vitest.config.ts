import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['**/*.test.ts'],
        typecheck: {
            enabled: true,
            checker: 'tsc',
            include: ['src/**/*.test.ts'],
        },
    },
});
