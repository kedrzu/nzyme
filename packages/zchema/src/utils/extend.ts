import type { Override, PartialOnUndefined } from '@nzyme/types';

import type { Infer, Schema, SchemaOptions } from '../Schema.js';

/**
 *
 */
export type Extend<S extends Schema, O> = ForceName & PartialOnUndefined<Override<S, O>>;

declare class ForceName {}

/**
 *
 */
export function extend<S extends Schema, O>(schema: S, options: O & SchemaOptions<Infer<S>>) {
    const merged = {
        ...schema,
        ...options,
    };

    return merged as unknown as Extend<S, O>;
}
