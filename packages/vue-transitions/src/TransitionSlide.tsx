import type { ExtractPropTypes, PropType } from 'vue';

import { defineTransition } from './defineTransition.js';
import css from './TransitionSlide.module.scss';

const transitionProps = {
    direction: {
        type: String as PropType<'down' | 'left' | 'right' | 'up'>,
        default: 'down',
    },
    fade: Boolean,
};

/** Directional slide transition component with optional fade. */
export const TransitionSlide = defineTransition({
    name: 'TransitionSlide',
    props: transitionProps,
    enterFromClass: inactiveClass,
    leaveToClass: inactiveClass,
    enterActiveClass: activeClass,
    leaveActiveClass: activeClass,
});

function inactiveClass(props: ExtractPropTypes<typeof transitionProps>) {
    return props.fade ? css[`fadeInactive_${props.direction}`] : css[`slideInactive_${props.direction}`];
}

function activeClass(props: ExtractPropTypes<typeof transitionProps>) {
    return props.fade ? css.fadeActive : css.slideActive;
}
