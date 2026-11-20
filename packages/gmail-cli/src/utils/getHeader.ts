import type { gmail_v1 } from '@googleapis/gmail';

/**
 * Value of a header by case-insensitive name, empty when absent.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
    return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}
