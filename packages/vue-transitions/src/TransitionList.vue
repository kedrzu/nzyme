<script lang="ts" setup>
import { computed, useCssModule } from 'vue';

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
   * Transition duration in milliseconds.
   * @default 400
   */
  duration?: number;

  /**
   * Transition delay in milliseconds.
   * @default 0
   */
  delay?: number;

  /**
   * Animation to use when the item is removed
   * @default 'fade'
   */
  animation?: 'fade' | 'slide-down' | 'slide-left' | 'slide-right' | 'slide-up';
}

const props = defineProps<TransitionListProps>();
const css = useCssModule('css');

const hiddenClass = computed(() => {
  return props.animation ? css[`hidden-${props.animation}`] : css['hidden-fade'];
});

function durationStyle(duration: number | undefined) {
  return duration ? `${duration / 1000}s` : undefined;
}
</script>

<template>
  <TransitionGroup
    :tag="tag || 'div'"
    :enter-active-class="css.enterActive"
    :enter-from-class="hiddenClass"
    :leave-active-class="css.leaveActive"
    :leave-to-class="hiddenClass"
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

.hidden {
  &-fade {
    opacity: 0;
  }

  &-slide-left {
    opacity: 0;
    transform: translateX(30px);
  }

  &-slide-right {
    opacity: 0;
    transform: translateX(-30px);
  }

  &-slide-up {
    opacity: 0;
    transform: translateY(-30px);
  }

  &-slide-down {
    opacity: 0;
    transform: translateY(30px);
  }
}

.leaveActive {
  position: absolute;
}
</style>
