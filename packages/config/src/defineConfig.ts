import type { Container } from '@nzyme/ioc/Container.js';
import { defineInjectable } from '@nzyme/ioc/Injectable.js';
import type { Injectable } from '@nzyme/ioc/Injectable.js';
import type { JsonValue } from '@nzyme/types/JsonValue.js';

import { RuntimeConfig } from './RuntimeConfig.js';

/** A typed key resolved from the runtime config document. */
export interface ConfigDefinition<
    TValue extends JsonValue,
    TRequired extends boolean = true,
    TMeta extends object = object,
> extends Injectable<TRequired extends true ? TValue : TValue | undefined> {
    /** Key in the runtime config document. */
    readonly name: string;

    /** Whether resolution fails when the document does not own the key. */
    readonly required: TRequired;

    /** Caller-declared facts about the key (e.g. that it is a secret); empty when none were given. */
    readonly meta: TMeta;
}

/** Options of {@link defineConfig}. */
export interface DefineConfigOptions<TMeta extends object, TRequired extends boolean = boolean> {
    /** Set to `false` to resolve to `undefined` instead of throwing when the document lacks the key. */
    required?: TRequired;

    /** Caller-declared facts about the key, typed through to `definition.meta`. */
    meta?: TMeta;
}

const DEPS = {
    runtimeConfig: RuntimeConfig,
};

/**
 * Defines a typed injectable key from the runtime config document.
 * @__NO_SIDE_EFFECTS__
 */
export function defineConfig<TValue extends JsonValue = string, TMeta extends object = object>(
    name: string,
    options?: DefineConfigOptions<TMeta, true>,
): ConfigDefinition<TValue, true, TMeta>;
/**
 * Defines an optional typed injectable key from the runtime config document.
 * @__NO_SIDE_EFFECTS__
 */
export function defineConfig<TValue extends JsonValue = string, TMeta extends object = object>(
    name: string,
    options: DefineConfigOptions<TMeta, false> & { required: false },
): ConfigDefinition<TValue, false, TMeta>;
/** Implementation overload for defineConfig. */
export function defineConfig(
    name: string,
    options?: DefineConfigOptions<object>,
): ConfigDefinition<JsonValue, boolean> {
    return defineInjectable<ConfigDefinition<JsonValue, boolean>>({
        name,
        deps: DEPS,
        required: options?.required ?? true,
        meta: options?.meta ?? {},
        resolve,
    });
}

function resolve(
    this: ConfigDefinition<JsonValue, boolean>,
    container: Container,
    caller?: Injectable,
): JsonValue | undefined {
    const runtimeConfig = container.resolve(RuntimeConfig);

    if (!Object.hasOwn(runtimeConfig, this.name)) {
        if (this.required) {
            throw new Error(`Runtime config key ${this.name} is not set. Caller: ${caller?.name}`);
        }

        return undefined;
    }

    return runtimeConfig[this.name];
}
