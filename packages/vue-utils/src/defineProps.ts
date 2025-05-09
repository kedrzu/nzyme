import type { ComponentObjectPropsOptions } from 'vue';

/**
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineProps<P extends ComponentObjectPropsOptions>(props: P) {
    return props;
}
