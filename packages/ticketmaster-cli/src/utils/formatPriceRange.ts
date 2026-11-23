import type { TicketmasterPriceRange } from '../TicketmasterTypes.js';

/**
 * The price range of an event as `min–max CUR`, or `min CUR` when min equals max or max is missing:
 * the first `standard` range, else the first one (a one-entry list formats that entry). Empty when
 * there is none.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function formatPriceRange(ranges: readonly TicketmasterPriceRange[] | undefined): string {
    const range = ranges?.find(entry => entry.type === 'standard') ?? ranges?.[0];
    if (!range) {
        return '';
    }

    const { min, max, currency } = range;
    const bounds = [min, max].filter(bound => bound != null);
    const amount = bounds.length === 2 && min !== max ? `${min}–${max}` : bounds.slice(0, 1).join('');
    return [amount, currency].filter(Boolean).join(' ');
}
