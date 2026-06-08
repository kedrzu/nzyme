import type { Dependencies } from '@nzyme/ioc/Service.js';

import type { defineStack, StackOptions, StackOutput } from './defineStack.js';

/**
 * A {@link defineStack} with its `name` and `region` pre-bound by a placement factory (e.g. a regional,
 * macro-region or global stack factory that derives the full name + provider region). The builder calls
 * it with the rest of the config — accepting everything `defineStack` does except `name`/`region`, so
 * the stack name lives in exactly one place. Generic per call, so it infers `deps`/output types from the
 * config literal just like `defineStack` itself.
 */
export type BoundDefineStack = <
    TDeps extends Dependencies = Dependencies,
    TOutput extends StackOutput = StackOutput,
    TBuild = void,
>(
    options: Omit<StackOptions<TDeps, TOutput, TBuild>, 'name' | 'region'>,
) => ReturnType<typeof defineStack<TDeps, TOutput, TBuild>>;
