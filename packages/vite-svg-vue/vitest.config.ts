import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

import { svgVuePlugin } from './src/svgVuePlugin.js';

// Component tests (`*.spec.ts`) in a real headless browser, importing fixtures through the plugin;
// `bun test` runs only `*.test.ts`. Comments are kept so the malicious fixture's comment payload
// reaches the plugin's own sanitising pass, as it would under a consumer config without `removeComments`.
export default defineConfig({
    plugins: [
        svgVuePlugin({
            svgo: { plugins: [{ name: 'preset-default', params: { overrides: { removeComments: false } } }] },
        }),
    ],
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
