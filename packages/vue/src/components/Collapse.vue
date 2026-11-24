<script lang="ts" setup>
/**
 * Animated collapse/expand component with optional lazy rendering and fade transitions.
 */
import { forceReflow } from '@nzyme/dom-utils/forceReflow.js';
import { isBrowser } from '@nzyme/dom-utils/isBrowser.js';
import { assertTruthy } from '@nzyme/utils/assert.js';
// Not the built-in `v-show`: hydrated while already shown (the `LazyHydrate` path below), the built-in
// leaves the server-rendered `display: none` in place for the transition to clear, which it never does
// (https://github.com/vuejs/core/pull/8371). Imported under another name because `v-show` always
// compiles to the built-in.
import { vShow as vShowHydrated } from '@nzyme/vue-utils/directives/vShow.js';
import { computed, getCurrentInstance, Transition, useCssModule } from 'vue';
import type { TransitionProps } from 'vue';

import { LazyHydrate } from './LazyHydrate.js';

interface CollapseProps {
  /**
   * `always` renders the content up front and toggles its visibility;
   * `lazy` renders it only while shown, unless it has to be hydrated from SSR.
   * @default 'lazy'
   */
  render?: 'always' | 'lazy';
  /** Whether the content is expanded. */
  show?: boolean;
  /** Fade the content in and out together with the height animation. */
  fade?: boolean;
}

// `<Transition>` is compiled away on the server and does not forward `_attrs` to its child, so the
// attributes are bound to the `<div>` explicitly.
defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<CollapseProps>(), { render: 'lazy' });
const emit = defineEmits<{
  heightChange: [height: number];
  afterEnter: [];
  afterLeave: [];
}>();

const css = useCssModule('css');
const vm = getCurrentInstance();

const lazyHydrate =
  props.render === 'always' ||
  (props.render === 'lazy' &&
    // There is no need to lazy load if it's shown from the start.
    !props.show &&
    // Check if we are on SSR or hydration process.
    (vm?.vnode.el != null || !isBrowser()));

const transition = computed<TransitionProps>(() => {
  const activeClass = props.fade ? `${css.collapse_active} ${css.collapse_fadeIn}` : css.collapse_active;

  return {
    appear: lazyHydrate,
    enterActiveClass: activeClass,
    enterFromClass: props.fade ? css.collapse_fadeOut : undefined,
    leaveActiveClass: activeClass,
    leaveFromClass: props.fade ? css.collapse_fadeOut : undefined,
    onBeforeEnter: beforeEnter,
    onEnter: enter,
    onAfterEnter: afterEnter,
    onLeave: leave,
    onAfterLeave: afterLeave,
  };
});

function beforeEnter(el: Element) {
  zeroHeight(asHTMLElement(el));
}

function enter(el: Element) {
  fixedHeight(asHTMLElement(el));
  emit('heightChange', el.scrollHeight);
}

function afterEnter(el: Element) {
  autoHeight(asHTMLElement(el));
  emit('afterEnter');
}

function leave(el: Element) {
  const element = asHTMLElement(el);
  fixedHeight(element);

  requestAnimationFrame(() => {
    zeroHeight(element);
    emit('heightChange', 0);
  });
}

function afterLeave(el: Element) {
  autoHeight(asHTMLElement(el));
  emit('afterLeave');
}

function fixedHeight(el: HTMLElement) {
  el.style.height = `${el.scrollHeight}px`;
  el.style.overflow = 'hidden';
  forceReflow(el);
}

function autoHeight(el: HTMLElement) {
  el.style.overflow = '';
  el.style.height = '';
  forceReflow(el);
}

function zeroHeight(el: HTMLElement) {
  el.style.height = '0';
  forceReflow(el);
}

function asHTMLElement(el: Element) {
  // The transitioned element is always the `<div>` rendered by this component.
  assertTruthy(el instanceof HTMLElement, 'Collapse transitions an HTML element.');
  return el;
}
</script>

<template>
  <LazyHydrate
    v-if="lazyHydrate"
    :when-triggered="show"
  >
    <Transition v-bind="transition">
      <div
        v-show-hydrated="show"
        v-bind="$attrs"
        :class="css.collapse"
      >
        <slot />
      </div>
    </Transition>
  </LazyHydrate>
  <Transition
    v-else
    v-bind="transition"
  >
    <div
      v-if="show"
      v-bind="$attrs"
      :class="css.collapse"
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

  &_active {
    // forces hardware acceleration
    will-change: height;
    transform: translateZ(0);
    backface-visibility: hidden;
    perspective: 1000px;
  }

  &_fadeOut {
    opacity: 0 !important;
  }

  &_fadeIn {
    opacity: 1;
  }
}
</style>
