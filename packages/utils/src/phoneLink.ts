const regex = /\s/g;

/**
 * Converts a phone number to a tel: link format.
 * Removes all whitespace characters from the phone number.
 * @util
 *
 * @param phone - The phone number to convert
 * @returns A tel: link string
 *
 * @example
 * ```typescript
 * phoneLink('+1 234 567 8900'); // 'tel:+12345678900'
 * ```
 */
export function phoneLink(phone: string) {
    return `tel:${phone.replace(regex, '')}`;
}
