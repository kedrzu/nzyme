import { defineTransition } from './defineTransition.js';
import css from './TransitionBump.module.scss';

export /**
 *
 */
const TransitionBump = defineTransition({
    name: 'TransitionBump',
    enterActiveClass: css.bumpEnterActive,
    leaveActiveClass: css.bumpLeaveActive,
});
