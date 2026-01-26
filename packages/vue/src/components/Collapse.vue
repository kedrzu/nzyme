<script lang="ts" setup>
import { getCurrentInstance, vShow, ComponentPublicInstance } from 'vue';

import { prop } from '../prop';

import css from './Collapse.module.scss';
import { LazyHydrate } from './LazyHydrate';

// Used to easily debug complex transition problems.
const DEBUG = false;

const props = defineProps({
  lazy: prop(Boolean).optional(),
  show: prop(Boolean).optional(),
});

const emit = defineEmits<{
  beforeEnter: [vm: ComponentPublicInstance];
  enter: [vm: ComponentPublicInstance];
  afterEnter: [vm: ComponentPublicInstance];
  beforeLeave: [vm: ComponentPublicInstance];
  leave: [vm: ComponentPublicInstance];
  afterLeave: [vm: ComponentPublicInstance];
  heightChange: [height: number];
}>();

const vm = getCurrentInstance();
const lazyHydrate =
  props.lazy &&
  // There is no need to lazy load if it's shown from the start.
  !props.show &&
  // Check if we are during hydration process.
  vm?.vnode.el != null;

function beforeEnter(el: Element) {
  if (DEBUG) console.warn('beforeEnter', el);
  zeroHeight(el as HTMLElement);
}

function enter(el: Element) {
  if (DEBUG) console.warn('enter', el);
  fixedHeight(el as HTMLElement);
  emit('heightChange', el.scrollHeight);
}

function afterEnter(el: Element) {
  if (DEBUG) console.warn('afterEnter', el);
  autoHeight(el as HTMLElement);
  emit('afterEnter');
}

function leave(el: Element) {
  if (DEBUG) console.warn('leave', el);
  fixedHeight(el as HTMLElement);

  requestAnimationFrame(() => {
    zeroHeight(el as HTMLElement);
    emit('heightChange', 0);
  });
}

function afterLeave(el: Element) {
  if (DEBUG) console.warn('afterLeave', el);
  autoHeight(el as HTMLElement);
}

function fixedHeight(el: HTMLElement) {
  el.style.height = `${el.scrollHeight}px`;
  el.style.overflow = 'hidden';
  if (DEBUG) console.warn('fixedHeight', el);
  forceRepaint(el);
}

function autoHeight(el: HTMLElement) {
  el.style.overflow = '';
  el.style.height = '';
  if (DEBUG) console.warn('autoHeight', el);
  forceRepaint(el);
}

function zeroHeight(el: HTMLElement) {
  el.style.height = '0';
  if (DEBUG) console.warn('zeroHeight', el);
  forceRepaint(el);
}

function forceRepaint(el: Element) {
  // Force repaint to make sure the
  // animation is triggered correctly.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  const height = getComputedStyle(el).height;
  if (DEBUG) console.warn('forceRepaint', el, height);
}
</script>

<template>
  <LazyHydrate
    v-if="lazyHydrate"
    :whenTriggered="props.show"
  >
    <Transition
      :enterFromClass="css.enterFrom"
      :enterActiveClass="css.enterActive"
      :leaveFromClass="css.leaveFrom"
      :leaveActiveClass="css.leaveActive"
      @beforeEnter="beforeEnter"
      @enter="enter"
      @afterEnter="afterEnter"
      @eave="leave"
      @afterLeave="afterLeave"
      appear
    >
      <div
        :class="css.collapse"
        v-show="props.show"
      >
        <slot />
      </div>
    </Transition>
  </LazyHydrate>
  <Transition
    v-else
    :enterFromClass="css.enterFrom"
    :enterActiveClass="css.enterActive"
    :leaveFromClass="css.leaveFrom"
    :leaveActiveClass="css.leaveActive"
    @beforeEnter="beforeEnter"
    @enter="enter"
    @afterEnter="afterEnter"
    @eave="leave"
    @afterLeave="afterLeave"
  >
    <div
      :class="css.collapse"
      v-show="props.show"
    >
      <slot />
    </div>
  </Transition>
</template>

<style lang="scss" module="css">
.collapse {
  transition:
    height 0.2s ease-out,
    opacity 0.2s ease-out 0.1s;
  box-sizing: content-box;
}

.enterActive,
.leaveActive {
  // forces hardware acceleration
  will-change: height;
  transform: translateZ(0);
  backface-visibility: hidden;
  perspective: 1000px;
}

.enterFrom {
  opacity: 0 !important;
}

.enterActive {
  opacity: 1;
}

.leaveFrom {
  opacity: 1;
}

.leaveActive {
  opacity: 0 !important;
}
</style>
