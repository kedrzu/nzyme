/** The longest text kept, before the ellipsis. */
const MAX_LENGTH = 600;

/**
 * A Last.fm wiki or bio summary as short plain text: HTML and the trailing "Read more on Last.fm" link
 * removed, basic entities decoded, whitespace collapsed, and anything over 600 characters cut at a word
 * boundary with an ellipsis. `''` for a missing or empty summary.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function cleanLastfmText(html: string | null): string {
    if (!html) {
        return '';
    }

    const text = html
        .replace(/<a\b[^>]*>\s*Read more on Last\.fm\s*<\/a>\.?/gi, '')
        // Block breaks separate words; inline tags (`<b>Cher</b>,`) must not add a space.
        .replace(/<(?:br|\/?p|\/?div|\/?li)\b[^>]*>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, decodeEntity)
        .replace(/\s+/g, ' ')
        .trim();

    if (text.length <= MAX_LENGTH) {
        return text;
    }

    const cut = text.slice(0, MAX_LENGTH);
    const boundary = cut.lastIndexOf(' ');
    return `${(boundary > 0 ? cut.slice(0, boundary) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

function decodeEntity(entity: string, name: string) {
    if (name.startsWith('#')) {
        const code = name[1] === 'x' || name[1] === 'X' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }

    switch (name.toLowerCase()) {
        case 'amp':
            return '&';
        case 'lt':
            return '<';
        case 'gt':
            return '>';
        case 'quot':
            return '"';
        case 'apos':
            return "'";
        case 'nbsp':
            return ' ';
        default:
            return entity;
    }
}
