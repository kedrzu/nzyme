<script lang="ts" setup>
/**
 * Paginated horizontal carousel with swipe support and optional auto-play.
 *
 * It follows the keyboard: an item focused on another page (Tab) turns the carousel to it. With `keyboard`,
 * the left and right arrow keys on an item turn the page too (opt-in: a consumer may handle them already).
 */
import { assertValue } from '@nzyme/utils/assert.js';
import type { ClassProp } from '@nzyme/vue-utils/classProp.js';
import { useIntersectionObserver } from '@nzyme/vue-utils/useIntersectionObserver.js';
import { useSwipeHorizontal } from '@nzyme/vue-utils/useSwipeHorizontal.js';
import { useVModel } from '@vueuse/core';
import debounce from 'lodash.debounce';
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, useCssModule, watch } from 'vue';
import type { FunctionalComponent } from 'vue';

import type { CarouselAlign, CarouselPage, CarouselSlot } from './CarouselTypes.js';
import { getCarouselPages } from './getCarouselPages.js';

interface CarouselProps {
  /**
   * Zero-based index of the current page (`v-model:page`).
   * @default 0
   */
  page?: number;
  /** Class of the carousel's root element (the one around the items). */
  class?: ClassProp;
  /**
   * Where the items of each page sit.
   * @default 'center'
   */
  align?: CarouselAlign;
  /** Puts only the first page at the start; the others follow `align`. */
  alignLeft?: boolean;
  /** Class of the element around the items. */
  itemsClass?: ClassProp;
  /**
   * Tag of the element around the items: `ul` (with `li` items) gives them list semantics.
   * @default 'div'
   */
  itemsTag?: string;
  /** Attributes of the element around the items (e.g. `role`, `aria-label`). */
  itemsAttrs?: Record<string, unknown>;
  /** Interval in milliseconds at which the pages turn on their own. */
  autoPlay?: number;
  /**
   * Whether the pages turn on a touch swipe.
   * @default true
   */
  touch?: boolean;
  /**
   * Whether the pages turn on a mouse drag.
   * @default true
   */
  mouse?: boolean;
  /** Whether the left and right arrow keys on an item (or the carousel itself) turn the page. */
  keyboard?: boolean;
}

const props = withDefaults(defineProps<CarouselProps>(), {
  page: 0,
  align: 'center',
  itemsTag: 'div',
  touch: true,
  mouse: true,
});
const emit = defineEmits<{
  'update:page': [page: number];
}>();
const slots = defineSlots<{
  /** Carousel items. */
  default?(props: CarouselSlot): unknown;
  /** Wrapper that provides full control over carousel rendering. */
  wrapper?(
    props: CarouselSlot & {
      /** Renders the default carousel inner layout. */
      CarouselInner: FunctionalComponent;
    },
  ): unknown;
}>();

/** What can take the focus in an item: where it goes when the arrow keys turn the page. */
const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Controls that use the arrow keys themselves. */
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

const css = useCssModule('css');

const carouselRef = ref<HTMLDivElement>();
const carouselItemsRef = ref<HTMLElement>();

const swipe = useSwipeHorizontal({
  element: carouselRef,
  enabled: () => pages.value.length > 1,
  onPan: onPan,
  onSwipe: onSwipe,
  touch: props.touch,
  mouse: props.mouse,
});

const width = ref(1);
const isMounted = ref(false);

// the length of this array is number of pages
// and values are indexes of first elements on each page
const pages = ref<CarouselPage[]>([]);
const pageCurrent = useVModel(props, 'page', emit);

/** The item `showItem` keeps in view, until the user turns the pages. */
let shownItem: number | null = null;

const deltaX = computed(() => {
  const pageOffset = pages.value[pageCurrent.value]?.offset ?? 0;
  const lastPageOffset = pages.value[pages.value.length - 1]?.offset ?? 0;

  const x = -1 * pageOffset + swipe.diffX;

  const maxLeft = width.value / 4;
  const maxRight = -lastPageOffset - maxLeft;

  return x > maxLeft ? maxLeft : x < maxRight ? maxRight : x;
});

const updateSizeDebounced = debounce(() => void updateSize(), 100);

useIntersectionObserver({
  element: carouselRef,
  onVisible: () => updateSize(),
});

let mutationObserver: MutationObserver | undefined;
let resizeObserver: ResizeObserver | undefined;
const resizeObserved = new Set<HTMLElement>();
let autoPlayInterval: ReturnType<typeof setInterval> | undefined;

const hasNext = computed(() => pageCurrent.value < pages.value.length - 1);
const hasPrevious = computed(() => pageCurrent.value > 0);
const swiping = computed(() => swipe.isPressing);

const slotProps = computed<CarouselSlot>(() => ({
  pages: pages.value,
  currentPage: pageCurrent.value,
  goToPage: goToPage,
  moveBy: moveBy,
  showItem: showItem,
  hasNext: hasNext.value,
  hasPrevious: hasPrevious.value,
}));

onMounted(() => {
  isMounted.value = true;
  void updateSize();

  window.addEventListener('resize', updateSizeDebounced, { passive: true });

  // update the carousel also when something inside changes
  if (typeof MutationObserver !== 'undefined') {
    mutationObserver = new MutationObserver(updateSizeDebounced);

    const items = assertValue(
      carouselItemsRef.value,
      'Carousel inner element not found. If using wrapper slot, make sure to render CarouselInner component.',
    );

    mutationObserver.observe(items, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  }

  // ...and when it or an item changes size without a window resize (an image loads, a sidebar opens)
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(updateSizeDebounced);
    if (carouselRef.value) {
      resizeObserver.observe(carouselRef.value);
    }
  }

  startAutoPlay();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateSizeDebounced);
  mutationObserver?.disconnect();
  resizeObserver?.disconnect();
  stopAutoPlay();
});

watch(() => props.autoPlay, startAutoPlay);
watch(
  () => swipe.isPressing,
  pressing => {
    // The user takes over from `showItem`.
    if (pressing) {
      shownItem = null;
    }
  },
);
watch([() => props.align, () => props.alignLeft], () => void updateSize());

defineExpose({ goToPage, moveBy, showItem });

/** The carousel itself: the element around the items, moved by the current page and the swipe. */
function CarouselInner() {
  return h(
    'div',
    {
      class: [css.carousel, swipe.isMoving && css.carousel_moving, props.class],
      onMouseenter: stopAutoPlay,
      onMouseleave: startAutoPlay,
      onFocusin: onFocusin,
      onKeydown: onKeydown,
      onScroll: onScroll,
      ref: carouselRef,
    },
    [
      h(
        props.itemsTag,
        {
          ...props.itemsAttrs,
          class: [css.carousel_items, props.itemsClass, swiping.value && css.carousel_itemsSwiping],
          ref: carouselItemsRef,
          style: { transform: `translate3d(${deltaX.value}px, 0, 0)` },
        },
        [h(Items)],
      ),
    ],
  );
}

function Items() {
  return slots.default?.(slotProps.value);
}

function getItemElements() {
  return Array.from(carouselItemsRef.value?.children ?? []).filter(e => e instanceof HTMLElement);
}

function onPan(distance: number) {
  if (Math.abs(distance) > width.value / 2) {
    moveBy(-distance);
  }
}

function onSwipe(distance: number) {
  moveBy(-distance);
}

async function updateSize() {
  await nextTick();

  const elements = getItemElements();
  observeSizes(elements);

  width.value = carouselRef.value?.offsetWidth ?? 320;
  pages.value = getCarouselPages({
    items: elements.map(e => ({ left: e.offsetLeft, width: e.clientWidth })),
    width: width.value,
    align: props.align,
    alignFirstPageToStart: props.alignLeft,
  });
  setPage(pageCurrent.value);
  followShownItem();
}

/** Observes the size of the items there are now; observing one again would report it again. */
function observeSizes(elements: HTMLElement[]) {
  if (!resizeObserver) {
    return;
  }

  for (const element of resizeObserved) {
    if (!elements.includes(element)) {
      resizeObserver.unobserve(element);
      resizeObserved.delete(element);
    }
  }

  for (const element of elements) {
    if (!resizeObserved.has(element)) {
      resizeObserver.observe(element);
      resizeObserved.add(element);
    }
  }
}

function moveBy(distance: number) {
  const direction = distance > 0 ? 1 : -1;
  goToPage(pageCurrent.value + direction);
}

function goToPage(index: number) {
  shownItem = null;
  setPage(index);
}

function setPage(index: number) {
  index = Math.min(index, pages.value.length - 1);
  index = Math.max(index, 0);

  pageCurrent.value = index;
}

function showItem(index: number) {
  shownItem = index;
  followShownItem();
}

function followShownItem() {
  // Not laid out yet: `updateSize` follows it once it is.
  const page = shownItem === null ? -1 : getPageOfItem(shownItem);
  if (page >= 0) {
    setPage(page);
  }
}

function getPageOfItem(index: number) {
  return pages.value.findIndex(page => index >= page.elementFrom && index <= page.elementTo);
}

function getItemIndexOf(target: EventTarget | null) {
  return target instanceof Node ? getItemElements().findIndex(item => item.contains(target)) : -1;
}

function goToNextPage() {
  if (hasNext.value) {
    goToPage(pageCurrent.value + 1);
  } else {
    goToPage(0);
  }
}

function startAutoPlay() {
  stopAutoPlay();

  if (props.autoPlay && props.autoPlay > 0) {
    autoPlayInterval = setInterval(goToNextPage, props.autoPlay);
  }
}

function stopAutoPlay() {
  if (autoPlayInterval) {
    clearInterval(autoPlayInterval);
    autoPlayInterval = undefined;
  }
}

function onFocusin(event: FocusEvent) {
  // A press focuses what is under the pointer, maybe a peeking item: that must not turn the page
  // under a starting swipe.
  if (swipe.isPressing) {
    return;
  }

  const page = getPageOfItem(getItemIndexOf(event.target));
  if (page >= 0 && page !== pageCurrent.value) {
    goToPage(page);
  }
}

function onKeydown(event: KeyboardEvent) {
  if (!props.keyboard || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return;
  }

  let step: number;
  switch (event.key) {
    case 'ArrowRight':
      step = 1;
      break;
    case 'ArrowLeft':
      step = -1;
      break;
    default:
      return;
  }

  const target = event.target;
  if (!(target instanceof Element) || target.closest(EDITABLE)) {
    return;
  }

  const onItem = getItemIndexOf(target) >= 0;
  if (!onItem && target !== carouselRef.value) {
    return;
  }

  const page = pageCurrent.value + step;
  if (page < 0 || page >= pages.value.length) {
    return;
  }

  event.preventDefault();
  goToPage(page);

  // The focus would stay on an item off the page: take it to the first thing to focus on the new one.
  if (onItem) {
    void focusPageStart();
  }
}

async function focusPageStart() {
  await nextTick();
  const item = getItemElements()[pages.value[pageCurrent.value]?.elementFrom ?? -1];
  const focusable = item?.matches(FOCUSABLE) ? item : item?.querySelector(FOCUSABLE);
  if (focusable instanceof HTMLElement) {
    focusable.focus();
  }
}

function onScroll() {
  // `overflow-x: clip` cannot be scrolled; where it is not supported (`hidden`), the browser scrolls
  // the carousel to a focused item, which the offset already shows.
  if (carouselRef.value && carouselRef.value.scrollLeft !== 0) {
    carouselRef.value.scrollLeft = 0;
  }
}
</script>

<template>
  <slot
    v-if="slots.wrapper"
    name="wrapper"
    v-bind="{ ...slotProps, CarouselInner }"
  />
  <CarouselInner v-else />
</template>

<style lang="scss" module="css">
.carousel {
  display: flex;
  position: relative;
  // The items are moved by a transform, so the browser must not scroll the carousel to a focused item or
  // for `scrollIntoView`: `clip` cannot be scrolled (and leaves the vertical overflow visible — focus
  // rings, shadows). Where `clip` is not supported, the carousel resets a scroll itself.
  overflow-x: hidden;
  overflow-x: clip;

  user-select: none;
  -webkit-user-drag: none;

  touch-action: pan-y;

  * {
    user-select: none;
    -webkit-user-drag: none;
  }

  &_moving {
    cursor: grabbing;
  }

  &_items {
    display: flex;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: visible;
    transition: transform 0.3s ease-out;
    min-width: 100%;

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  }

  &_itemsSwiping {
    transition: none;
  }
}
</style>
