import { h } from 'vue';
import type { Component, SetupContext } from 'vue';

import type { ComponentEmits, ComponentPropsWithEmits, ComponentSlots } from './types.js';

/** Creates a wrapper component that pre-binds the given props to the target component. */
export function withProps<C extends Component>(component: C, props: ComponentPropsWithEmits<C>) {
    return (_props: object | null | undefined, ctx: SetupContext<ComponentEmits<C>, ComponentSlots<C>>) => {
        return h(component, props, ctx.slots);
    };
}
