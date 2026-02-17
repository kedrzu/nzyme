import { defineTransition } from './defineTransition.js';
import css from './TransitionBump.module.scss';

/**
 * A transition that bumps the element up and down when it enters and leaves the viewport.
 *
 * @param props - The props for the transition.
 * @returns The transition component.
 */
export const TransitionBump = defineTransition({
    name: 'TransitionBump',
    enterActiveClass: css.bumpEnterActive,
    leaveActiveClass: css.bumpLeaveActive,
});
