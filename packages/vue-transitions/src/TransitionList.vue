<script lang="ts" setup>
import { TransitionGroup } from 'vue';

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
}

const props = withDefaults(defineProps<TransitionListProps>(), {
  tag: 'div',
  horizontal: false,
});
</script>

<template>
  <TransitionGroup
    :tag="tag"
    :enter-active-class="css.enterActive"
    :enter-from-class="horizontal ? css.enterFromHorizontal : css.enterFrom"
    :leave-active-class="css.leaveActive"
    :leave-to-class="horizontal ? css.leaveToHorizontal : css.leaveTo"
    :move-class="css.move"
  >
    <slot />
  </TransitionGroup>
</template>

<style lang="scss" module="css">
.move,
.enterActive,
.leaveActive {
  transition: all 0.4s ease;
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
