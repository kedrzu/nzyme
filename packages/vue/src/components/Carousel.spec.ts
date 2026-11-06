import { describe, expect, test } from 'vitest';
import { page as browserPage, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-vue';
import { defineComponent, h, ref } from 'vue';
import type { VNode } from 'vue';

import { Carousel } from './Carousel.jsx';
import type { CarouselAlign, CarouselSlot } from './Carousel.jsx';

const CAROUSEL_WIDTH = 300;
const ITEM_WIDTH = 100;
const ITEM_COUNT = 7;

/** What `Carousel` exposes on its template ref. */
interface CarouselApi {
    goToPage: (page: number) => void;
    moveBy: (numberOfPages: number) => void;
    showItem: (index: number) => void;
}

type WrapperSlot = (props: CarouselSlot & { CarouselInner: () => VNode }) => VNode;

interface RenderCarouselOptions {
    page?: number;
    align?: CarouselAlign;
    keyboard?: boolean;
    autoPlay?: number;
    wrapper?: WrapperSlot;
}

describe('Carousel', () => {
    test('splits the items into pages by how many fit in its width', async () => {
        const carousel = await renderCarousel({ align: 'start' });

        await expect
            .poll(() => carousel.slot()?.pages)
            .toEqual([
                { elementFrom: 0, elementTo: 2, offset: 0 },
                { elementFrom: 3, elementTo: 5, offset: 300 },
                { elementFrom: 6, elementTo: 6, offset: 600 },
            ]);
    });

    test('centres the items of a page by default', async () => {
        const carousel = await renderCarousel();

        await expect.poll(() => carousel.slot()?.pages.map(page => page.offset)).toEqual([0, 300, 500]);
        carousel.api().goToPage(2);
        await expect.poll(() => carousel.itemLeft(6)).toBe((CAROUSEL_WIDTH - ITEM_WIDTH) / 2);
    });

    test('`goToPage` on the ref turns the page, emits `update:page` and clamps to the pages there are', async () => {
        const carousel = await renderCarousel({ align: 'start' });
        await carousel.laidOut();

        carousel.api().goToPage(1);
        await expect.poll(() => carousel.itemLeft(3)).toBe(0);
        expect(carousel.pageChanges()).toEqual([1]);

        carousel.api().goToPage(99);
        await expect.poll(() => carousel.itemLeft(6)).toBe(0);
        expect(carousel.pageChanges()).toEqual([1, 2]);
    });

    test('`moveBy` on the ref turns one page in its direction', async () => {
        const carousel = await renderCarousel({ align: 'start' });
        await carousel.laidOut();

        carousel.api().moveBy(1);
        await expect.poll(() => carousel.slot()?.currentPage).toBe(1);
        carousel.api().moveBy(5);
        await expect.poll(() => carousel.slot()?.currentPage).toBe(2);
        carousel.api().moveBy(-1);
        await expect.poll(() => carousel.slot()?.currentPage).toBe(1);
        expect(carousel.pageChanges()).toEqual([1, 2, 1]);
    });

    test('`showItem` on the ref turns to the page with that item', async () => {
        const carousel = await renderCarousel({ align: 'start' });
        await carousel.laidOut();

        carousel.api().showItem(6);
        await expect.poll(() => carousel.slot()?.currentPage).toBe(2);
        await expect.poll(() => carousel.itemLeft(6)).toBe(0);
    });

    test('the default slot gets `goToPage`, `moveBy` and `showItem`', async () => {
        const carousel = await renderCarousel({ align: 'start' });
        await carousel.laidOut();

        carousel.slot()!.goToPage(2);
        await expect.poll(() => carousel.slot()?.currentPage).toBe(2);
        carousel.slot()!.moveBy(-1);
        await expect.poll(() => carousel.slot()?.currentPage).toBe(1);
        carousel.slot()!.showItem(0);
        await expect.poll(() => carousel.slot()?.currentPage).toBe(0);
        expect(carousel.pageChanges()).toEqual([2, 1, 0]);
    });

    test('`hasNext` and `hasPrevious` follow the current page', async () => {
        const carousel = await renderCarousel({ align: 'start' });
        await carousel.laidOut();

        expect(carousel.slot()).toMatchObject({ currentPage: 0, hasNext: true, hasPrevious: false });
        carousel.api().goToPage(1);
        await expect.poll(() => carousel.slot()).toMatchObject({ currentPage: 1, hasNext: true, hasPrevious: true });
        carousel.api().goToPage(2);
        await expect.poll(() => carousel.slot()).toMatchObject({ currentPage: 2, hasNext: false, hasPrevious: true });
    });

    test('starts on the `page` prop and follows it when it changes', async () => {
        const carousel = await renderCarousel({ align: 'start', page: 1 });
        await carousel.laidOut();
        await expect.poll(() => carousel.itemLeft(3)).toBe(0);

        carousel.page.value = 2;
        await expect.poll(() => carousel.itemLeft(6)).toBe(0);
    });

    test('with `keyboard`, the arrow keys on an item turn the page and move the focus onto it', async () => {
        const carousel = await renderCarousel({ align: 'start', keyboard: true });
        await carousel.laidOut();

        carousel.button(0).focus();
        await userEvent.keyboard('{ArrowRight}');
        await expect.poll(() => carousel.slot()?.currentPage).toBe(1);
        await expect.poll(() => document.activeElement).toBe(carousel.button(3));

        await userEvent.keyboard('{ArrowLeft}');
        await expect.poll(() => carousel.slot()?.currentPage).toBe(0);
        await expect.poll(() => document.activeElement).toBe(carousel.button(0));
        expect(carousel.pageChanges()).toEqual([1, 0]);
    });

    test('without `keyboard`, the arrow keys do not turn the page', async () => {
        const carousel = await renderCarousel({ align: 'start' });
        await carousel.laidOut();

        carousel.button(0).focus();
        await userEvent.keyboard('{ArrowRight}');
        expect(carousel.slot()?.currentPage).toBe(0);
        expect(carousel.pageChanges()).toEqual([]);
    });

    test('focusing an item on another page turns to it', async () => {
        const carousel = await renderCarousel({ align: 'start' });
        await carousel.laidOut();

        carousel.button(4).focus();
        await expect.poll(() => carousel.slot()?.currentPage).toBe(1);
        await expect.poll(() => carousel.itemLeft(3)).toBe(0);
        expect(carousel.pageChanges()).toEqual([1]);
    });

    test('the `wrapper` slot renders the items with `CarouselInner` and gets the controls', async () => {
        const carousel = await renderCarousel({
            align: 'start',
            wrapper: ({ CarouselInner, currentPage, hasNext, moveBy }) =>
                h('div', [
                    h(CarouselInner),
                    h('button', { disabled: !hasNext, onClick: () => moveBy(1) }, `Next from ${currentPage}`),
                ]),
        });
        await carousel.laidOut();

        await expect.element(browserPage.getByTestId('item-6')).toBeInTheDocument();
        await browserPage.getByRole('button', { name: 'Next from 0' }).click();
        await expect.element(browserPage.getByRole('button', { name: 'Next from 1' })).toBeInTheDocument();
        await expect.poll(() => carousel.itemLeft(3)).toBe(0);

        await browserPage.getByRole('button', { name: 'Next from 1' }).click();
        await expect.element(browserPage.getByRole('button', { name: 'Next from 2' })).toBeDisabled();
        expect(carousel.pageChanges()).toEqual([1, 2]);
    });

    test('with `autoPlay`, turns the pages on its own and wraps around to the first', async () => {
        const carousel = await renderCarousel({ align: 'start', autoPlay: 50 });

        await expect.poll(() => carousel.pageChanges().slice(0, 3)).toEqual([1, 2, 0]);
    });
});

async function renderCarousel(options: RenderCarouselOptions = {}) {
    const page = ref(options.page ?? 0);
    const updates: number[] = [];
    const carouselRef = ref<CarouselApi>();
    let lastSlot: CarouselSlot | undefined;

    const Host = defineComponent({
        setup() {
            return () =>
                h('div', { style: { width: `${CAROUSEL_WIDTH}px` } }, [
                    h(
                        Carousel,
                        {
                            ref: carouselRef,
                            page: page.value,
                            'onUpdate:page': (value: number) => {
                                updates.push(value);
                                page.value = value;
                            },
                            align: options.align,
                            keyboard: options.keyboard,
                            autoPlay: options.autoPlay,
                        },
                        {
                            default: (slot: CarouselSlot) => {
                                lastSlot = slot;
                                return Array.from({ length: ITEM_COUNT }, (_, index) =>
                                    h(
                                        'div',
                                        {
                                            key: index,
                                            'data-testid': `item-${index}`,
                                            style: { width: `${ITEM_WIDTH}px`, flexShrink: 0 },
                                        },
                                        [h('button', { type: 'button' }, `Item ${index}`)],
                                    ),
                                );
                            },
                            ...(options.wrapper ? { wrapper: options.wrapper } : {}),
                        },
                    ),
                ]);
        },
    });

    const screen = await render(Host);

    return {
        screen,
        page,
        /**
         * The pages `update:page` turned the `v-model` to, each change once: the carousel also emits the
         * current page again when it lays the pages out, which a `v-model` does not see.
         */
        pageChanges: () => {
            let previous = options.page ?? 0;
            const changes: number[] = [];
            for (const value of updates) {
                if (value !== previous) {
                    changes.push(value);
                    previous = value;
                }
            }
            return changes;
        },
        api: () => carouselRef.value!,
        slot: () => lastSlot,
        laidOut: () => expect.poll(() => lastSlot?.pages.length).toBe(3),
        button: (index: number) =>
            browserPage.getByTestId(`item-${index}`).element().querySelector<HTMLButtonElement>('button')!,
        /** Left edge of the item relative to the carousel's left edge, as the user sees it. */
        itemLeft: (index: number) =>
            Math.round(
                browserPage.getByTestId(`item-${index}`).element().getBoundingClientRect().left -
                    screen.container.firstElementChild!.getBoundingClientRect().left,
            ),
    };
}
