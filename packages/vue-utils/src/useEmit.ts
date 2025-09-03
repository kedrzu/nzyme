import type { EmitsOptions, ObjectEmitsOptions } from 'vue';

import type { UnionToIntersection } from '@nzyme/types';

import { useInstance } from './useInstance.js';

export function useEmit(): EmitFn;
export function useEmit<E extends EmitsOptions>(emitOptions?: E): EmitFn<E>;
export function useEmit() {
    return useInstance().emit;
}

type EmitFn<Options = ObjectEmitsOptions, Event extends keyof Options = keyof Options> =
    Options extends Array<infer V>
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (event: V, ...args: any[]) => void
        : // eslint-disable-next-line @typescript-eslint/ban-types
          {} extends Options
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (event: string, ...args: any[]) => void
          : UnionToIntersection<
                {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    [key in Event]: Options[key] extends (...args: infer Args) => any
                        ? (event: key, ...args: Args) => void
                        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          Options[key] extends any[]
                          ? (event: key, ...args: Options[key]) => void
                          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (event: key, ...args: any[]) => void;
                }[Event]
            >;
