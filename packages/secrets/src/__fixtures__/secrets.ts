import { defineConfig } from '@nzyme/config/defineConfig.js';

import { defineSecret } from '../defineSecret.js';

/** A secret kept in the developer's own store. */
export const GITHUB_TOKEN = defineSecret('GITHUB_TOKEN', {
    description: 'Personal GitHub token',
    meta: { store: 'personal' },
});

/** A secret kept in the shared store, used only in production. */
export const DB_PASSWORD = defineSecret('DB_PASSWORD', {
    enabled: env => env.ENV === 'production',
    meta: { store: 'shared' },
});

/** A secret kept in the shared store. */
export const API_KEY = defineSecret('API_KEY', { meta: { store: 'shared' } });

/** Not a secret: `getSecretDefinitions` skips it. */
export const LOG_LEVEL = defineConfig('LOG_LEVEL');

/** Not a definition at all. */
export const VERSION = '1.0.0';
