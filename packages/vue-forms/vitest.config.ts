import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Component tests (`*.spec.ts`) in a real headless browser; `bun test` runs only `*.test.ts`.
export default defineConfig({
    plugins: [vue(), vueJsx()],
    test: {
        include: ['src/**/*.spec.ts'],
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
        },
    },
});
