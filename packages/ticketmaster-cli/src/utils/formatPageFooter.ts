import type { TicketmasterPage } from '../TicketmasterTypes.js';

/**
 * The footer line a list command always ends with: `# page N/M, T events` (N from 1), or `# 0 events`
 * when nothing matched, so an empty result reads differently from a failure. `noun` is singular
 * (`event`); an `s` is added unless the total is one.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function formatPageFooter(page: TicketmasterPage, noun: string): string {
    const total = `${page.totalElements} ${noun}${page.totalElements === 1 ? '' : 's'}`;
    if (page.totalElements === 0) {
        return `# ${total}\n`;
    }

    return `# page ${page.number + 1}/${page.totalPages}, ${total}\n`;
}
