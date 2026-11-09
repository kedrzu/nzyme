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
