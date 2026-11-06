import type { CarouselPage, GetCarouselPagesParams } from './CarouselTypes.js';

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
