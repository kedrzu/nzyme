import type { Injectable } from '@nzyme/ioc/Injectable.js';

import type { SecretsMapping } from '../SecretsMapping.js';

/**
 * Options of {@link defineSecretsCommands}.
 */
export interface SecretsCommandsOptions {
    /**
     * The project's service resolving to its `SecretsMapping`. Each command resolves it from its own
     * container, so the mapping is read only when a command runs.
     */
    provider: Injectable<SecretsMapping>;
}
