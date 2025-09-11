import type { AllowedComponentProps, ComponentPublicInstance, VNodeProps } from 'vue';

/**
 * Union type representing elements that can be used with Vue utilities.
 * Includes DOM elements, Vue component instances, and global objects.
 */
export type ElementOrVue = ComponentPublicInstance | Document | Element | HTMLElement | SVGElement | Window;

/**
 * Component props type including emits.
 */
export type ComponentPropsWithEmits<C> = C extends new (...args: unknown[]) => { $props: infer P }
    ? FlattenProps<P>
    : never;

/**
 * Component props type.
 */
export type ComponentProps<C> = FilterOutEmitProps<ComponentPropsWithEmits<C>>;

/**
 * Component props type including emits.
 */
export type ComponentEmitProps<C> = FilterOnlyEmitProps<ComponentPropsWithEmits<C>>;

/**
 * Component emits type.
 */
export type ComponentEmits<C> = C extends new (...args: unknown[]) => { $emit: infer E } ? E : never;

type FlattenProps<T> = Exclude<
    {
        -readonly [K in keyof T as K extends keyof AllowedComponentProps | keyof VNodeProps ? never : K]: T[K];
    },
    undefined
>;

type FilterOutEmitProps<P> = {
    [K in keyof P as IfEventEmit<K, P[K], never, K>]: P[K];
};

type FilterOnlyEmitProps<P> = {
    [K in keyof P as IfEventEmit<K, P[K], K, never>]: P[K];
};

type IfEventEmit<K, V, Y, N> = K extends `on${Capitalize<string>}`
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Exclude<V, null | undefined> extends (...args: any[]) => any
        ? Y
        : N
    : N;
