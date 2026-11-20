import type { Injectable } from '@nzyme/ioc/Injectable.js';

import type { SecretDefinition } from '../defineSecret.js';
import type { SecretStore } from '../SecretStore.js';

/**
 * What a project tells the `secrets` commands: the stores its secrets live in and where a key is
 * written. Declared as a service, `defineService<SecretsProvider>(…)`.
 */
export interface SecretsProvider {
    /** Every store the project reads secrets from, most preferred first: for a key in several, the earlier wins. */
    stores: SecretStore[];
    /**
     * The store `secrets set <name>` writes the key to. The project's write policy: throw a
     * `UsageError` to refuse a key (not a secret, the wrong tier, no store for it). Nothing is written
     * when it throws.
     */
    target(name: string): SecretStore;
    /**
     * The project's declared secrets (`getSecretDefinitions`). When given, `set` and `run` refuse a
     * name that is not declared or not enabled in this environment, `run` with no names takes every
     * enabled one, and `list` reports against them. Without it, the commands trust the names they get.
     */
    secrets?: readonly SecretDefinition[];
}

/**
 * Options of {@link defineSecretsCommands}.
 */
export interface SecretsCommandsOptions {
    /**
     * The project's service resolving to its `SecretsProvider`. Each command resolves it from its own
     * container, so the stores are touched only when a command runs.
     */
    provider: Injectable<SecretsProvider>;
}
