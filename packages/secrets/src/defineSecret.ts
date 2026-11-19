import { defineConfig } from '@nzyme/config/defineConfig.js';
import type { ConfigDefinition } from '@nzyme/config/defineConfig.js';
import { RuntimeConfig } from '@nzyme/config/RuntimeConfig.js';
import type { Container } from '@nzyme/ioc/Container.js';
import type { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { defineInjectable, isInjectable } from '@nzyme/ioc/Injectable.js';
import type { Injectable } from '@nzyme/ioc/Injectable.js';

/** The metadata keys {@link defineSecret} owns; a project's own metadata may not use them. */
export type SecretMetaReservedKey = 'secret' | 'description' | 'enabled';

/** Metadata {@link defineSecret} attaches to every secret, next to the project's own. */
export interface SecretMeta {
    readonly secret: true;
    readonly description: string | undefined;
    /** Whether the secret is used in the environment described by `env`. */
    readonly enabled: (env: EnvVariables) => boolean;
}

/**
 * A required string config key marked as a secret. `TMeta` is the project's own metadata, flat in
 * `meta` next to {@link SecretMeta}.
 */
export type SecretDefinition<TMeta extends object = object> = ConfigDefinition<string, true, SecretMeta & TMeta>;

/** Options of {@link defineSecret}. */
export interface DefineSecretOptions {
    description?: string;
    /** Whether the secret is used in the environment described by `env`; always, when omitted. */
    enabled?: (env: EnvVariables) => boolean;
}

/** Options of {@link defineSecret} with the project's own metadata. */
export interface DefineSecretWithMetaOptions<TMeta extends object> extends DefineSecretOptions {
    /** The project's own metadata, which nzyme does not interpret. The reserved keys are a type error. */
    meta: TMeta & { readonly [K in SecretMetaReservedKey]?: never };
}

/**
 * Defines a secret: a required string config key whose metadata marks it as a secret. A repo
 * declares all its secrets in one module, which `getSecretDefinitions` collects.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecret(name: string, options?: DefineSecretOptions): SecretDefinition;
/**
 * Defines a secret carrying the project's own metadata, flat in `meta` next to {@link SecretMeta}.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecret<const TMeta extends Record<string, unknown>>(
    name: string,
    options: DefineSecretWithMetaOptions<TMeta>,
): SecretDefinition<TMeta>;
/**
 * Implementation overload for defineSecret.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSecret(
    name: string,
    options?: DefineSecretOptions | DefineSecretWithMetaOptions<Record<string, unknown>>,
): SecretDefinition<Record<string, unknown>> {
    const projectMeta = options && 'meta' in options ? options.meta : undefined;
    const config = defineConfig<string, SecretMeta & Record<string, unknown>>(name, {
        meta: {
            ...projectMeta,
            secret: true,
            description: options?.description,
            enabled: options?.enabled ?? alwaysEnabled,
        },
    });

    return defineInjectable<string, SecretDefinition<Record<string, unknown>>>({
        ...config,
        resolve(container: Container, caller?: Injectable) {
            if (!Object.hasOwn(container.resolve(RuntimeConfig), name)) {
                throw new Error(
                    `Secret ${name} is not set. Store it with \`secrets set ${name}\`, or set it as an environment variable. Caller: ${caller?.name}`,
                );
            }

            return config.resolve(container, caller);
        },
    });
}

/** Whether a value is a definition created by {@link defineSecret}. */
export function isSecretDefinition(value: unknown): value is SecretDefinition {
    if (!isInjectable(value) || !('meta' in value)) {
        return false;
    }

    const { meta } = value;
    return typeof meta === 'object' && meta !== null && 'secret' in meta && meta.secret === true;
}

/** Whether a secret is used in the environment described by `env`. */
export function isSecretEnabled(definition: SecretDefinition, env: EnvVariables): boolean {
    return definition.meta.enabled(env);
}

function alwaysEnabled() {
    return true;
}
