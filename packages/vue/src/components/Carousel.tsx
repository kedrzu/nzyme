import { classProp } from '@nzyme/vue-utils/classProp.js';
import { defineSlots } from '@nzyme/vue-utils/slots.js';
import { useIntersectionObserver } from '@nzyme/vue-utils/useIntersectionObserver.js';
import { useSwipeHorizontal } from '@nzyme/vue-utils/useSwipeHorizontal.js';
import { useVModel } from '@vueuse/core';
import debounce from 'lodash.debounce';
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { PropType } from 'vue';
import type { JSX } from 'vue/jsx-runtime';

import css from './Carousel.module.scss';

/** Describes a single carousel page with its element range and scroll offset. */
export type CarouselPage = {
    /** Index of the first element on this page. */
    elementFrom: number;
    /** Index of the last element on this page. */
    elementTo: number;
    /** Horizontal scroll offset in pixels for this page. */
    offset: number;
};

/** Where the items of a page sit in the carousel: at its start, or centred in it. */
export type CarouselAlign = 'start' | 'center';

/** Slot props exposed by the Carousel component. */
export type CarouselSlot = {
    /** Zero-based index of the currently active page. */
    currentPage: number;
    /** Navigate to a specific page by index. */
    goToPage: (page: number) => void;
    /** Whether there is a next page available. */
    hasNext: boolean;
    /** Whether there is a previous page available. */
    hasPrevious: boolean;
    /** Move by a signed number of pages (positive = forward). */
    moveBy: (numberOfPages: number) => void;
    /** Array of carousel pages. */
    pages: CarouselPage[];
    /**
     * Turn to the page with the item at `index` (e.g. one just added), and keep following it while the
     * pages are laid out again (items loading, the width settling) until the user turns the pages.
     */
    showItem: (index: number) => void;
};

/** Horizontal box of one carousel item, in pixels from the carousel's left edge. */
export interface CarouselItemBox {
    left: number;
    width: number;
}

/** Input of {@link getCarouselPages}. */
export interface GetCarouselPagesParams {
    /** The items, in order. */
    items: CarouselItemBox[];
    /** Width of the carousel. */
    width: number;
    align: CarouselAlign;
    /** Puts the first page at the start whatever `align` says (the `alignLeft` prop). */
    alignFirstPageToStart?: boolean;
}

/** What can take the focus in an item: where it goes when the arrow keys turn the page. */
const FOCUSABLE =
    'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Controls that use the arrow keys themselves. */
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * Paginated horizontal carousel with swipe support and optional auto-play.
 *
 * It follows the keyboard: an item focused on another page (Tab) turns the carousel to it. With `keyboard`,
 * the left and right arrow keys on an item turn the page too (opt-in: a consumer may handle them already).
 */
export const Carousel = defineComponent({
    name: 'Carousel',
    props: {
        page: { type: Number, default: 0 },
        class: classProp,
        /** Where the items of each page sit. */
        align: { type: String as PropType<CarouselAlign>, default: 'center' },
        /** Puts only the first page at the start; the others follow `align`. */
        alignLeft: Boolean,
        itemsClass: classProp,
        /** Tag of the element around the items: `ul` (with `li` items) gives them list semantics. */
        itemsTag: { type: String, default: 'div' },
        /** Attributes of the element around the items (e.g. `role`, `aria-label`). */
        itemsAttrs: Object as PropType<Record<string, unknown>>,
        autoPlay: Number,
        touch: { type: Boolean, default: true },
        mouse: { type: Boolean, default: true },
        /** Whether the left and right arrow keys on an item (or the carousel itself) turn the page. */
        keyboard: Boolean,
    },
    emits: {
        'update:page': (page: number) => page >= 0,
    },
    slots: defineSlots<{
        /** Default slot for carousel items. */
        default: CarouselSlot;
        /** Wrapper slot that provides full control over carousel rendering. */
        wrapper: CarouselSlot & {
            /** Renders the default carousel inner layout. */
            CarouselInner: () => JSX.Element;
        };
    }>(),
    setup(props, { slots, emit, expose }) {
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

        onMounted(() => {
            isMounted.value = true;
            void updateSize();

            window.addEventListener('resize', updateSizeDebounced, { passive: true });

            // update the carousel also when something inside changes
            if (typeof MutationObserver !== 'undefined') {
                mutationObserver = new MutationObserver(updateSizeDebounced);

                const items = carouselItemsRef.value;
                if (!items) {
                    throw new Error(
                        'Carousel inner element not found. If using wrapper slot, make sure to render CarouselInner component.',
                    );
                }

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

        const hasNext = computed(() => pageCurrent.value < pages.value.length - 1);
        const hasPrevious = computed(() => pageCurrent.value > 0);
        const swiping = computed(() => swipe.isPressing);

        expose({ goToPage, moveBy, showItem });

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
            if (
                !props.keyboard ||
                event.defaultPrevented ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey
            ) {
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

        return () => {
            const wrapperSlot = slots.wrapper;
            if (!wrapperSlot) {
                return <CarouselInner />;
            }

            return wrapperSlot({
                pages: pages.value,
                currentPage: pageCurrent.value,
                goToPage: goToPage,
                moveBy: moveBy,
                showItem: showItem,
                hasNext: hasNext.value,
                hasPrevious: hasPrevious.value,
                CarouselInner: CarouselInner,
            });
        };

        function CarouselInner() {
            return (
                <div
                    class={[css.carousel, swipe.isMoving && css.carousel_moving, props.class]}
                    onMouseenter={stopAutoPlay}
                    onMouseleave={startAutoPlay}
                    onFocusin={onFocusin}
                    onKeydown={onKeydown}
                    onScroll={onScroll}
                    ref={carouselRef}
                >
                    {h(
                        props.itemsTag,
                        {
                            ...props.itemsAttrs,
                            class: [css.items, props.itemsClass, swiping.value && css.items_swiping],
                            ref: carouselItemsRef,
                            style: { transform: `translate3d(${deltaX.value}px, 0, 0)` },
                        },
                        [<Items />],
                    )}
                </div>
            );
        }

        function Items() {
            return (
                <>
                    {slots.default?.({
                        pages: pages.value,
                        currentPage: pageCurrent.value,
                        goToPage: goToPage,
                        moveBy: moveBy,
                        showItem: showItem,
                        hasNext: hasNext.value,
                        hasPrevious: hasPrevious.value,
                    })}
                </>
            );
        }
    },
});

/**
 * Splits the carousel's items into pages: as many items as fit in its width per page, each page moved
 * (`offset`) so its items sit where `align` says.
 *
 * @__NO_SIDE_EFFECTS__
 */
export function getCarouselPages(params: GetCarouselPagesParams): CarouselPage[] {
    const { items, width } = params;
    let page: CarouselPage = { elementFrom: 0, elementTo: 0, offset: 0 };
    let pageStart = items[0]?.left ?? 0;
    const pages = [page];
    const firstItemLeft = pageStart;

    for (const [index, item] of items.entries()) {
        const itemEnd = item.left + item.width;

        // does it fit into the current page?
        if (itemEnd <= pageStart + width + 1) {
            page.elementTo = index;
        } else {
            page = { elementFrom: index, elementTo: index, offset: 0 };
            pageStart = item.left;
            pages.push(page);
        }

        if ((params.alignFirstPageToStart && pages.length === 1) || params.align === 'start') {
            // Its first item where the first page's first item is: past the padding before the items.
            page.offset = pageStart - firstItemLeft;
        } else {
            const shift = (width - (itemEnd - pageStart)) / 2;
            page.offset = pageStart - shift;
        }
    }

    return pages;
}
