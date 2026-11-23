import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

import { svgVuePlugin } from './src/svgVuePlugin.js';

// Component tests (`*.spec.ts`) in a real headless browser, importing fixtures through the plugin;
// `bun test` runs only `*.test.ts`.
export default defineConfig({
    plugins: [svgVuePlugin()],
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
