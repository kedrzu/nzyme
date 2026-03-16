<script lang="ts">
const fallbackKey = Symbol('fallback');
</script>

<script lang="ts" setup>
import type { ComponentPublicInstance } from 'vue';
import { getCurrentInstance } from 'vue';

import { getOuterHeight } from '@nzyme/dom-utils/getOuterHeight.js';

import { useElement } from '../useElement';

const emit = defineEmits<{
  beforeEnter: [vm: ComponentPublicInstance];
  enter: [vm: ComponentPublicInstance];
  afterEnter: [vm: ComponentPublicInstance];
  beforeLeave: [vm: ComponentPublicInstance];
  leave: [vm: ComponentPublicInstance];
  afterLeave: [vm: ComponentPublicInstance];
}>();

const element = useElement<HTMLElement>();
const vm = getCurrentInstance()?.proxy;

function beforeLeave(el: HTMLElement) {
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
  fixedHeight(el as HTMLElement);
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

function fixedHeight(el: HTMLElement) {
  const height = getOuterHeight(el);
  element.value!.style.height = `${height}px`;
  element.value!.style.overflow = 'hidden';
  forceRepaint(el);
}

function autoHeight() {
  element.value!.style.overflow = '';
  element.value!.style.height = '';
}

function forceRepaint(el: HTMLElement) {
  // Force repaint to make sure the
  // animation is triggered correctly.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  getComputedStyle(el).height;
}
</script>

<template>
  <div :class="css.reveal">
    <div :class="css.reveal_inner">
      <Transition
        :enter-from-class="css.enterFrom"
        :enter-active-class="css.enterActive"
        :leave-from-class="css.leaveFrom"
        :leave-active-class="css.leaveActive"
        @before-enter="beforeEnter"
        @enter="enter"
        @after-enter="afterEnter"
        @before-leave="beforeLeave"
        @leave="leave"
        @after-leave="afterLeave"
      >
        <slot>
          <div :key="fallbackKey" />
        </slot>
      </Transition>
    </div>
  </div>
</template>

<style lang="scss" module="css">
.reveal {
  transition: height 0.2s ease-out;
  display: flex;
  flex-direction: column;
  box-sizing: content-box !important;

  &_inner {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 0 auto;
  }
}

.enterActive,
.leaveActive {
  // forces hardware acceleration
  will-change: height;
  transform: translateZ(0);
  backface-visibility: hidden;
  perspective: 1000px;
}

.enterActive {
  transition:
    opacity 0.2s ease-out 0.1s,
    transform 0.2s ease-out 0.1s;
  opacity: 1;
}

.enterFrom {
  opacity: 0 !important;
  transform: scale(0.97) !important;
}

.leaveActive {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  transition: opacity 0.3s ease-out;
  opacity: 0;
}

.leaveFrom {
  opacity: 1 !important;
}
</style>
