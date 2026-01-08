import type { Slot } from 'vue';

/**
 * Props for the RenderSlot component
 */
export interface RenderSlotProps<T> {
    /**
     * The slot to render. If not provided, the slot will not be rendered.
     */
    renderer?: Slot<T>;

    /**
     * The props to pass to the slot.
     */
    props: T;
}

/**
 * Render a slot with the given props
 * @param props - The props for the slot
 * @returns The rendered slot
 */
export function RenderSlot<T>(props: RenderSlotProps<T>) {
    return props.renderer ? props.renderer(props.props) : null;
}
