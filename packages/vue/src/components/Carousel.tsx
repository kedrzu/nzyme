import debounce from 'lodash.debounce';
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { JSX } from 'vue/jsx-runtime';

import { useVModel } from '@vueuse/core';

import { classProp } from '@nzyme/vue-utils/classProp.js';
import { defineSlots } from '@nzyme/vue-utils/slots.js';
import { useElementClass } from '@nzyme/vue-utils/useElementClass.js';
import { useIntersectionObserver } from '@nzyme/vue-utils/useIntersectionObserver.js';
import { useSwipeHorizontal } from '@nzyme/vue-utils/useSwipeHorizontal.js';

import css from './Carousel.module.scss';

export type CarouselPage = {
    elementFrom: number;
    elementTo: number;
    offset: number;
};

export type CarouselSlot = {
    currentPage: number;
    goToPage: (page: number) => void;
    hasNext: boolean;
    hasPrevious: boolean;
    moveBy: (numberOfPages: number) => void;
    /** Array of carousel pages */
    pages: CarouselPage[];
};

export const Carousel = defineComponent({
    name: 'Carousel',
    props: {
        page: { type: Number, default: 0 },
        class: classProp,
        alignLeft: Boolean,
        itemsClass: classProp,
        autoPlay: Number,
        touch: { type: Boolean, default: true },
        mouse: { type: Boolean, default: true },
    },
    slots: defineSlots<{
        default: CarouselSlot;
        wrapper: CarouselSlot & { CarouselInner: () => JSX.Element };
    }>(),
    emits: {
        'update:page': (page: number) => page >= 0,
    },
    setup(props, { slots, emit }) {
        const carouselRef = ref<HTMLDivElement>();
        const carouselItemsRef = ref<HTMLUListElement>();

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

            startAutoPlay();
        });

        onBeforeUnmount(() => {
            window.removeEventListener('resize', updateSizeDebounced);
            mutationObserver?.disconnect();
            stopAutoPlay();
        });

        useElementClass({
            elements: () => document.body,
            class: () => swipe.isMoving && css.moving,
        });

        const hasNext = computed(() => pageCurrent.value < pages.value.length - 1);
        const hasPrevious = computed(() => pageCurrent.value > 0);
        const swiping = computed(() => swipe.isPressing);

        function getPages(): CarouselPage[] {
            const elements = Array.from(carouselItemsRef.value?.childNodes || []).filter(e => e instanceof HTMLElement);

            const pages: CarouselPage[] = [
                {
                    elementFrom: 0,
                    elementTo: 0,
                    offset: 0,
                },
            ];

            if (!elements) {
                return pages;
            }

            for (let i = 0; i < elements.length; i++) {
                const element = elements[i]!;
                const elementStart = element.offsetLeft;
                const elementWidth = element.clientWidth;
                const elementEnd = elementStart + elementWidth;
                const carouselWidth = width.value;

                let page = pages[pages.length - 1]!;
                let pageStartElement = elements[page.elementFrom]!;
                let pageStart = pageStartElement.offsetLeft;
                let pageEnd = pageStart + width.value;

                // does it fill into current page?
                const fillsOnPage = elementEnd <= pageEnd + 1;

                if (!fillsOnPage) {
                    pages.push({
                        elementFrom: i,
                        elementTo: i,
                        offset: 0,
                    });

                    page = pages[pages.length - 1]!;
                    pageStartElement = elements[page.elementFrom]!;
                    pageStart = pageStartElement.offsetLeft;
                    pageEnd = pageStart + width.value;
                } else {
                    page.elementTo = i;
                }

                // only first page is aligned to left
                const alignLeft = props.alignLeft && pages.length <= 1;
                if (alignLeft) {
                    page.offset = 0;
                } else {
                    const shift = (carouselWidth - (elementEnd - pageStart)) / 2;
                    page.offset = pageStart - shift;
                }
            }

            return pages;
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

            width.value = carouselRef.value?.offsetWidth ?? 320;
            pages.value = getPages();
            goToPage(pageCurrent.value);
        }

        function moveBy(distance: number) {
            const direction = distance > 0 ? 1 : -1;
            goToPage(pageCurrent.value + direction);
        }

        function goToPage(index: number) {
            index = Math.min(index, pages.value.length - 1);
            index = Math.max(index, 0);

            pageCurrent.value = index;
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

        watch(() => props.autoPlay, startAutoPlay);

        return () => {
            const wrapperSlot = slots.wrapper;
            if (!wrapperSlot) {
                return <Carousel />;
            }

            return wrapperSlot({
                pages: pages.value,
                currentPage: pageCurrent.value,
                goToPage: goToPage,
                moveBy: moveBy,
                hasNext: hasNext.value,
                hasPrevious: hasPrevious.value,
                CarouselInner: Carousel,
            });
        };

        function Carousel() {
            return (
                <div
                    class={[css.carousel, props.class]}
                    onMouseenter={stopAutoPlay}
                    onMouseleave={startAutoPlay}
                    ref={carouselRef}
                >
                    <div
                        class={[css.items, props.itemsClass, swiping.value && css.items_swiping]}
                        ref={carouselItemsRef}
                        style={{ transform: `translate3d(${deltaX.value}px, 0, 0)` }}
                    >
                        <Items />
                    </div>
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
                        hasNext: hasNext.value,
                        hasPrevious: hasPrevious.value,
                    })}
                </>
            );
        }
    },
});
