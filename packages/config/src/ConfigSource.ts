import type { JsonValue } from '@nzyme/types/JsonValue.js';

/** A named origin of config entries, such as the environment, a file or a secret store. */
export interface ConfigSource {
    /** Name reported in the `Config loaded` log; never a value. */
    readonly name: string;

    /** Reads the entries this source contributes. */
    load(): Record<string, JsonValue> | Promise<Record<string, JsonValue>>;
}
