import { type EmitsOptions, type ObjectEmitsOptions, capitalize } from 'vue';

import type { RecordToUnion, UnionToIntersection } from '@nzyme/types';

import { useInstance } from './useInstance.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEmitAsync<E extends EmitsOptions>(options: E): EmitFnAsync<E>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEmitAsync<E extends Record<string, any[]>>(): ShortEmits<E>;
export function useEmitAsync() {
    const instance = useInstance();

    return (event: string, ...args: unknown[]) => {
        const attrName = 'on' + capitalize(event);

        type Listener = (...args: unknown[]) => unknown;
        const listeners = instance.vnode.props?.[attrName] as Listener[] | Listener | undefined;

        if (!listeners) {
            return;
        }

        if (Array.isArray(listeners)) {
            const promises: unknown[] = [];
            for (const listener of listeners) {
                if (typeof listener === 'function') {
                    promises.push(listener(...args));
                }
            }

            // there are many listeners for this event
            return Promise.all(promises);
        } else if (typeof listeners === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            return listeners(...args);
        }
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ShortEmits<T extends Record<string, any>> = UnionToIntersection<
    RecordToUnion<{
        [K in keyof T]: (evt: K, ...args: T[K]) => Promise<void>;
    }>
>;

type EmitFnAsync<Options = ObjectEmitsOptions, Event extends keyof Options = keyof Options> =
    Options extends Array<infer V>
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (event: V, ...args: any[]) => void
        : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
          {} extends Options
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (event: string, ...args: any[]) => void
          : UnionToIntersection<
                {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    [key in Event]: Options[key] extends (...args: infer Args) => any
                        ? (event: key, ...args: Args) => Promise<void> | void
                        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          (event: key, ...args: any[]) => Promise<void> | void;
                }[Event]
            >;
