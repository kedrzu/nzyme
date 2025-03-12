const regex = /\s/g;
/**
 * Convert a phone number to a link.
 */
export function phoneLink(phone: string) {
    return `tel:${phone.replace(regex, '')}`;
}
