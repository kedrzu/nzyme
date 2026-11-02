import type { Injectable } from '@nzyme/ioc/Injectable.js';

import type { SecretsMapping } from '../SecretsProvider.js';

/**
 * Options of {@link defineSecretsCommands}.
 */
export interface SecretsCommandsOptions {
    /**
     * The project's service implementing `SecretsProvider`. Each command resolves it from its own
     * container, so the mapping is read only when a command runs.
     */
    provider: Injectable<SecretsMapping>;
}
