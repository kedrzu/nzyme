import css from './TransitionBump.module.scss';
import { defineTransition } from './defineTransition.js';

export const TransitionBump = defineTransition({
    name: 'TransitionBump',
    enterActiveClass: css.bumpEnterActive,
    leaveActiveClass: css.bumpLeaveActive,
});
