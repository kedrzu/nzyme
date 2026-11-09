import { defineInterface } from '@nzyme/ioc/Interface.js';
import type { JsonValue } from '@nzyme/types/JsonValue.js';

/** The immutable JSON document supplied to the current runtime. */
export type RuntimeConfig = Readonly<Record<string, JsonValue>>;

/**
 * Config document of the current runtime.
 *
 * Every runtime installs its own document in its setup function: assembled from sources by
 * `loadConfig`, or as a literal. There is deliberately no default: a runtime that resolves a config
 * key without installing a document fails naming this interface, instead of reaching for a file
 * that a browser bundle cannot read and a process running from an unexpected directory would not
 * find.
 */
export const RuntimeConfig = defineInterface<RuntimeConfig>({ name: 'RuntimeConfig' });
