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
}

withDefaults(defineProps<TransitionListProps>(), {
  tag: 'div',
});
</script>

<template>
  <TransitionGroup
    :tag="tag"
    :enter-active-class="css.enterActive"
    :enter-from-class="css.enterFrom"
    :leave-active-class="css.leaveActive"
    :leave-to-class="css.leaveTo"
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

.leaveActive {
  position: absolute;
}
</style>
