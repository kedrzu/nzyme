import { expect, test } from 'bun:test';

import { getCarouselPages } from './Carousel.jsx';
import type { CarouselItemBox, CarouselPage } from './Carousel.jsx';

// Five items 100px wide, 10px apart, after 10px of padding; the carousel is 250px wide: two to a page.
const items: CarouselItemBox[] = [0, 1, 2, 3, 4].map(index => ({ left: 10 + index * 110, width: 100 }));

test('getCarouselPages fits as many items as the width takes and centres each page', () => {
    const expected: CarouselPage[] = [
        { elementFrom: 0, elementTo: 1, offset: -10 },
        { elementFrom: 2, elementTo: 3, offset: 210 },
        { elementFrom: 4, elementTo: 4, offset: 375 },
    ];
    expect(getCarouselPages({ items, width: 250, align: 'center' })).toEqual(expected);
});

test('getCarouselPages puts only the first page at the start for alignLeft', () => {
    const expected: CarouselPage[] = [
        { elementFrom: 0, elementTo: 1, offset: 0 },
        { elementFrom: 2, elementTo: 3, offset: 210 },
        { elementFrom: 4, elementTo: 4, offset: 375 },
    ];
    expect(getCarouselPages({ items, width: 250, align: 'center', alignFirstPageToStart: true })).toEqual(expected);
});

test('getCarouselPages aligned to the start puts every page where the first one starts', () => {
    const expected: CarouselPage[] = [
        { elementFrom: 0, elementTo: 1, offset: 0 },
        { elementFrom: 2, elementTo: 3, offset: 220 },
        { elementFrom: 4, elementTo: 4, offset: 440 },
    ];
    expect(getCarouselPages({ items, width: 250, align: 'start' })).toEqual(expected);
});
