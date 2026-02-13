import type { Override } from '@nzyme/types/Common.js';
import type { PartialOnUndefined } from '@nzyme/types/PartialOnUndefined.js';

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
