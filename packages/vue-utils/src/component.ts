import type { AllowedComponentProps, ComponentCustomProps, EmitsOptions, ObjectEmitsOptions, VNodeProps } from 'vue';

import type { SomeObject, UnionToIntersection } from '@nzyme/types';

declare type PublicProps = AllowedComponentProps & ComponentCustomProps & VNodeProps;

declare type EmitFn<Options = ObjectEmitsOptions, Event extends keyof Options = keyof Options> =
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
                        ? (event: key, ...args: Args) => void
                        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          (event: key, ...args: any[]) => void;
                }[Event]
            >;

/**
 * Type definition for Vue component with typed props, slots, and emits.
 * Provides strong typing for component instances including their public API.
 *
 * @template Props - The component's props interface
 * @template Slots - The component's slots interface
 * @template Emits - The component's emits options
 *
 * @example
 * ```typescript
 * interface MyComponentProps {
 *   title: string;
 *   count?: number;
 * }
 *
 * interface MyComponentSlots {
 *   default: () => VNode[];
 *   header: (props: { title: string }) => VNode[];
 * }
 *
 * interface MyComponentEmits {
 *   click: (id: number) => void;
 *   change: (value: string) => void;
 * }
 *
 * type MyComponent = Component<MyComponentProps, MyComponentSlots, MyComponentEmits>;
 * ```
 */
export type Component<Props = SomeObject, Slots = SomeObject, Emits extends EmitsOptions = SomeObject> = {
    new (): ClassComponent<Props, Slots, Emits>;
};

interface ClassComponent<Props, Slots, Emits extends EmitsOptions> {
    $props: Props & PublicProps;
    $slots: Slots;
    $emit: EmitFn<Emits>;
}
