import { defineTransition } from './defineTransition.js';
import css from './TransitionFade.module.scss';

/** Simple fade in/out transition component. */
export const TransitionFade = defineTransition({
    name: 'TransitionFade',
    enterFromClass: css.fadeInactive,
    leaveToClass: css.fadeInactive,
    enterActiveClass: css.fadeActive,
    leaveActiveClass: css.fadeActive,
});
