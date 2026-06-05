import type { Injectable } from '@nzyme/ioc/Injectable.js';
import { defineInjectable } from '@nzyme/ioc/Injectable.js';
import type { Dependencies } from '@nzyme/ioc/Service.js';
import { getObjectKeys } from '@nzyme/utils/getObjectKeys.js';
import { mapObject } from '@nzyme/utils/mapObject.js';

import type { StackDefinition, StackOutput, StackReference } from './defineStack.js';

/**
 * Fan-in helper: turn a map of stacks (e.g. one per region) into a single injectable that resolves to
 * a map of their {@link StackReference}s. Used when one stack depends on *every* placement of another
 * — e.g. a global edge stack that reads all regional API endpoints. The returned injectable depends on
 * each stack's `ref()`, so the deploy scheduler orders the consumer after all of them.
 * @__NO_SIDE_EFFECTS__
 */
export function refAll<K extends string, TOutput extends StackOutput>(
    stacks: Record<K, StackDefinition<Dependencies, TOutput>>,
): Injectable<Record<K, StackReference<TOutput>>> {
    const refs = mapObject(stacks, stack => stack.ref());

    const deps: Dependencies = {};
    for (const key of getObjectKeys(refs)) {
        deps[key] = refs[key];
    }

    return defineInjectable({
        deps,
        resolve: container => mapObject(refs, ref => container.resolve(ref)),
    });
}
