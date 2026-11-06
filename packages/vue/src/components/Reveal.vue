<script lang="ts" setup>
/**
 * Animates its wrapper's height when the default slot's content is swapped (a change of the root
 * node's `key`), cross-fading the leaving and entering content. An empty slot animates to zero height.
 */
import { getOuterHeight } from '@nzyme/dom-utils/getOuterHeight.js';
import { assertTruthy, assertValue } from '@nzyme/utils/assert.js';
import { getCurrentInstance, useCssModule, useTemplateRef } from 'vue';
import type { ComponentPublicInstance } from 'vue';

interface RevealProps {
  /**
   * Transition duration in milliseconds.
   * @default 200
   */
  duration?: number;
}

defineProps<RevealProps>();
const emit = defineEmits<{
  beforeEnter: [vm: ComponentPublicInstance];
  enter: [vm: ComponentPublicInstance];
  afterEnter: [vm: ComponentPublicInstance];
  beforeLeave: [vm: ComponentPublicInstance];
  leave: [vm: ComponentPublicInstance];
  afterLeave: [vm: ComponentPublicInstance];
}>();

const css = useCssModule('css');
const wrapper = useTemplateRef<HTMLElement>('wrapper');
const vm = assertValue(getCurrentInstance()?.proxy);

/**
 * Key of the placeholder rendered for an empty slot, so `<Transition>` always has a keyed child to
 * animate from or to. A symbol cannot collide with a key the slot content uses.
 */
const fallbackKey = Symbol('fallback');

function beforeLeave(el: Element) {
  fixedHeight(el);
  emit('beforeLeave', vm);
}

function leave() {
  emit('leave', vm);
}

function beforeEnter() {
  emit('beforeEnter', vm);
}

function enter(el: Element) {
  fixedHeight(el);
  emit('enter', vm);
}

function afterEnter() {
  autoHeight();
  emit('afterEnter', vm);
}

function afterLeave() {
  autoHeight();
  emit('afterLeave', vm);
}

function fixedHeight(el: Element) {
  // The transitioned element is the slot's root node or the fallback `<div>`.
  assertTruthy(el instanceof HTMLElement, 'Reveal transitions an HTML element.');
  const element = assertValue(wrapper.value);

  element.style.height = `${getOuterHeight(el)}px`;
  element.style.overflow = 'hidden';
  forceRepaint(el);
}

function autoHeight() {
  const element = assertValue(wrapper.value);
  element.style.overflow = '';
  element.style.height = '';
}

function forceRepaint(el: HTMLElement) {
  // Reading the computed height forces a reflow, so the browser registers the height
  // set just before as the transition's starting point. Returned only so the read is not
  // an unused expression.
  return getComputedStyle(el).height;
}
</script>

<template>
  <div
    ref="wrapper"
    :class="css.reveal"
    :style="{ '--reveal-duration': duration != null ? `${duration}ms` : undefined }"
  >
    <div :class="css.reveal_inner">
      <Transition
        :enter-active-class="css.reveal_enterActive"
        :enter-from-class="css.reveal_enterFrom"
        :leave-active-class="css.reveal_leaveActive"
        :leave-from-class="css.reveal_leaveFrom"
        @before-enter="beforeEnter"
        @enter="enter"
        @after-enter="afterEnter"
        @before-leave="beforeLeave"
        @leave="leave"
        @after-leave="afterLeave"
      >
        <slot><div :key="fallbackKey" /></slot>
      </Transition>
    </div>
  </div>
</template>

<style lang="scss" module="css">
.reveal {
  transition: height var(--reveal-duration, 0.2s) ease-out;
  display: flex;
  flex-direction: column;
  box-sizing: content-box !important;

  &_inner {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 0 auto;
  }

  &_enterActive,
  &_leaveActive {
    // forces hardware acceleration
    will-change: height;
    transform: translateZ(0);
    backface-visibility: hidden;
    perspective: 1000px;
  }

  &_enterActive {
    transition:
      opacity var(--reveal-duration, 0.2s) ease-out calc(var(--reveal-duration, 0.2s) * 0.5),
      transform var(--reveal-duration, 0.2s) ease-out calc(var(--reveal-duration, 0.2s) * 0.5);
    opacity: 1;
  }

  &_enterFrom {
    opacity: 0 !important;
    transform: scale(0.97) !important;
  }

  &_leaveActive {
    position: absolute !important;
    top: 0;
    left: 0;
    right: 0;
    transition: opacity calc(var(--reveal-duration, 0.2s) * 1.5) ease-out;
    opacity: 0;
  }

  &_leaveFrom {
    opacity: 1 !important;
  }
}
</style>
