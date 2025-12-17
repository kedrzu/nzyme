<script lang="ts" setup>
import { onAfterTransition } from './utils/onAfterTransition.js';
import { onBeforeTransition } from './utils/onBeforeTransition.js';

/**
 * Props for TransitionList component
 */
interface TransitionListProps {
  /**
   * The HTML tag to render as the container
   * @default 'div'
   */
  tag?: string;

  /**
   * Whether the list is horizontal (items animate in Y axis when removed)
   * @default false
   */
  horizontal?: boolean;

  /**
   * Transition duration in milliseconds.
   * @default 400
   */
  duration?: number;

  /**
   * Transition delay in milliseconds.
   * @default 0
   */
  delay?: number;
}

withDefaults(defineProps<TransitionListProps>(), {
  tag: 'div',
  horizontal: false,
});

function durationStyle(duration: number | undefined) {
  return duration ? `${duration / 1000}s` : undefined;
}
</script>

<template>
  <TransitionGroup
    :tag="tag"
    :enter-active-class="css.enterActive"
    :enter-from-class="horizontal ? css.enterFromHorizontal : css.enterFrom"
    :leave-active-class="css.leaveActive"
    :leave-to-class="horizontal ? css.leaveToHorizontal : css.leaveTo"
    :move-class="css.move"
    :style="{
      '--transition-list-duration': durationStyle(duration),
      '--transition-list-delay': durationStyle(delay),
    }"
  >
    <slot />
  </TransitionGroup>
</template>

<style lang="scss" module="css">
.move,
.enterActive,
.leaveActive {
  transition: all var(--transition-list-duration, 0.4s) var(--transition-list-delay, 0s) ease !important;
}

.enterFrom,
.leaveTo {
  opacity: 0;
  transform: translateX(30px);
}

.enterFromHorizontal,
.leaveToHorizontal {
  opacity: 0;
  transform: translateY(30px);
}

.leaveActive {
  position: absolute;
}
</style>
