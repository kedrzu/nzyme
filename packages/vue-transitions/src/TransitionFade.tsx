import { defineTransition } from './defineTransition.js';
import css from './TransitionFade.module.scss';

export /**
 *
 */
const TransitionFade = defineTransition({
    name: 'TransitionFade',
    enterFromClass: css.fadeInactive,
    leaveToClass: css.fadeInactive,
    enterActiveClass: css.fadeActive,
    leaveActiveClass: css.fadeActive,
});
