import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        typecheck: {
            enabled: true,
            checker: 'tsc',
            include: ['src/**/*.test.ts'],
        },
    },
});
