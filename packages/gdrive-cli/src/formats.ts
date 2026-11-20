// Google-native files (Docs, Sheets, Slides, Drawings) have no bytes of their own: they are exported to
// a regular format on the way out and converted from one on the way in. This module holds those
// mappings and the parsing of file references.

export const FOLDER = 'application/vnd.google-apps.folder';
export const SHORTCUT = 'application/vnd.google-apps.shortcut';
export const DOCUMENT = 'application/vnd.google-apps.document';
export const SPREADSHEET = 'application/vnd.google-apps.spreadsheet';
export const PRESENTATION = 'application/vnd.google-apps.presentation';
export const DRAWING = 'application/vnd.google-apps.drawing';
export const SCRIPT = 'application/vnd.google-apps.script';

/** Export formats by file extension. */
const FORMATS = {
    md: 'text/markdown',
    txt: 'text/plain',
    html: 'text/html',
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    odt: 'application/vnd.oasis.opendocument.text',
    rtf: 'application/rtf',
    epub: 'application/epub+zip',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ods: 'application/x-vnd.oasis.opendocument.spreadsheet',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    odp: 'application/vnd.oasis.opendocument.presentation',
    png: 'image/png',
    jpg: 'image/jpeg',
    svg: 'image/svg+xml',
    json: 'application/vnd.google-apps.script+json',
} satisfies Record<string, string>;

/** What a Google-native type exports to. */
export interface NativeType {
    label: string;
    /** The extensions `download` may export to, the first being the default. */
    download: string[];
    /** The extension `read` exports to; a type without one has no text form. */
    text?: string;
    /** Said alongside the text `read` prints. */
    textNote?: string;
}

/** The Google-native types that can be exported, by MIME type. */
export const NATIVE: Record<string, NativeType> = {
    [DOCUMENT]: {
        label: 'Google Doc',
        download: ['docx', 'pdf', 'md', 'txt', 'html', 'odt', 'rtf', 'epub'],
        text: 'md',
    },
    [SPREADSHEET]: {
        label: 'Google Sheet',
        download: ['xlsx', 'pdf', 'csv', 'tsv', 'ods'],
        text: 'csv',
        textNote: 'CSV export holds only the first sheet - download as xlsx for every sheet',
    },
    [PRESENTATION]: { label: 'Google Slides', download: ['pptx', 'pdf', 'txt', 'odp'], text: 'txt' },
    [DRAWING]: { label: 'Google Drawing', download: ['png', 'pdf', 'svg', 'jpg'] },
    [SCRIPT]: { label: 'Apps Script', download: ['json'], text: 'json' },
};

/**
 * Whether the MIME type is a Google-native one, which has no bytes to download.
 * @__NO_SIDE_EFFECTS__
 */
export function isNative(mimeType: string | null | undefined): boolean {
    return !!mimeType && mimeType.startsWith('application/vnd.google-apps.');
}

/**
 * A short name of the type for output: `folder`, `Google Doc`, or the MIME type itself.
 * @__NO_SIDE_EFFECTS__
 */
export function typeLabel(mimeType: string | null | undefined): string {
    if (!mimeType) {
        return 'unknown';
    }

    if (mimeType === FOLDER) {
        return 'folder';
    }

    if (mimeType === SHORTCUT) {
        return 'shortcut';
    }

    return NATIVE[mimeType]?.label ?? mimeType;
}

/** A resolved export format: the file extension and the MIME type to request. */
export interface DownloadFormat {
    ext: string;
    mimeType: string;
}

/**
 * The export `download` makes of a Google file: the requested extension checked against the type, or
 * the type's default. Throws for a type that cannot be exported or a format it does not export to.
 * @__NO_SIDE_EFFECTS__
 */
export function downloadFormat(mimeType: string, requested?: string): DownloadFormat {
    const native = NATIVE[mimeType];
    if (!native) {
        throw new Error(`${mimeType} cannot be exported - only Docs, Sheets, Slides, Drawings and Apps Script can`);
    }

    const ext = (requested ?? native.download[0] ?? '').replace(/^\./, '').toLowerCase();
    const format = formatOf(ext);
    if (!native.download.includes(ext) || !format) {
        throw new Error(`A ${native.label} exports to ${native.download.join(', ')} - not '${ext}'`);
    }

    return { ext, mimeType: format };
}

/** The text export of a Google file, with an optional note on what the text form leaves out. */
export interface TextExport {
    mimeType: string;
    note?: string;
}

/**
 * The export `read` makes of a Google file, or null when the type has no text form.
 * @__NO_SIDE_EFFECTS__
 */
export function textExport(mimeType: string): TextExport | null {
    const native = NATIVE[mimeType];
    const format = native?.text ? formatOf(native.text) : undefined;
    return format ? { mimeType: format, note: native?.textNote } : null;
}

/**
 * The MIME type of an export format, by its extension.
 * @__NO_SIDE_EFFECTS__
 */
function formatOf(ext: string): string | undefined {
    const formats: Record<string, string> = FORMATS;
    return formats[ext];
}

/**
 * Whether `read` prints a regular file of this type as text.
 * @__NO_SIDE_EFFECTS__
 */
export function isTextMime(mimeType: string | null | undefined): boolean {
    if (!mimeType) {
        return false;
    }

    return (
        mimeType.startsWith('text/') ||
        /[+/](json|xml|yaml|javascript|x-sh|x-httpd-php|sql|toml)$/.test(mimeType) ||
        mimeType === 'application/x-yaml'
    );
}

/** Which Google type an upload becomes when converted. */
const IMPORTS: Record<string, string> = {
    'text/markdown': DOCUMENT,
    'text/plain': DOCUMENT,
    'text/html': DOCUMENT,
    'application/rtf': DOCUMENT,
    'application/msword': DOCUMENT,
    [FORMATS.docx]: DOCUMENT,
    [FORMATS.odt]: DOCUMENT,
    'text/csv': SPREADSHEET,
    'text/tab-separated-values': SPREADSHEET,
    'application/vnd.ms-excel': SPREADSHEET,
    [FORMATS.xlsx]: SPREADSHEET,
    'application/vnd.oasis.opendocument.spreadsheet': SPREADSHEET,
    'application/vnd.ms-powerpoint': PRESENTATION,
    [FORMATS.pptx]: PRESENTATION,
    [FORMATS.odp]: PRESENTATION,
};

/**
 * The Google type content of this MIME type converts to, or undefined when it cannot be converted.
 * @__NO_SIDE_EFFECTS__
 */
export function importTargetOf(mimeType: string): string | undefined {
    return IMPORTS[mimeType];
}

/**
 * The Google type an upload of this MIME type converts to; throws when it cannot be converted.
 * @__NO_SIDE_EFFECTS__
 */
export function importTarget(mimeType: string): string {
    const target = IMPORTS[mimeType];
    if (!target) {
        throw new Error(
            `${mimeType} cannot be converted to a Google file - only text, Markdown, HTML, Word, Excel, CSV, PowerPoint and OpenDocument files can`,
        );
    }

    return target;
}

/**
 * A file id, or the id inside a `drive.google.com` / `docs.google.com` URL.
 * @param name What the input is called in errors.
 * @__NO_SIDE_EFFECTS__
 */
export function fileIdFrom(input: string | undefined, name = 'file'): string {
    const s = input?.trim();
    if (!s) {
        throw new Error(`'${name}' is required`);
    }

    if (/^[A-Za-z0-9_-]+$/.test(s)) {
        return s;
    }

    let url: URL;
    try {
        url = new URL(s);
    } catch {
        throw new Error(`'${name}': '${s}' is neither a Drive file id nor a URL`);
    }

    if (!/(^|\.)google\.com$/.test(url.hostname)) {
        throw new Error(`'${name}': ${url.hostname} is not a Google Drive URL`);
    }

    const fromPath = /\/(?:d|folders)\/([A-Za-z0-9_-]+)/.exec(url.pathname);
    const id = fromPath?.[1] ?? url.searchParams.get('id');
    if (!id) {
        throw new Error(`'${name}': no file id in ${s}`);
    }

    return id;
}

/**
 * A string for the Drive query language, quoted.
 * @__NO_SIDE_EFFECTS__
 */
export function quote(value: string): string {
    return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

/** Params of {@link searchQuery}. */
export interface SearchQueryParams {
    /** Drive query syntax, or a full-text phrase. */
    query?: string;
    /** Only the direct children of this folder. */
    folderId?: string;
    mimeType?: string;
}

/**
 * The Drive query of `search`: Drive query syntax passes through, anything else is a full-text phrase.
 * Trashed files are left out unless the query names `trashed`.
 * @__NO_SIDE_EFFECTS__
 */
export function searchQuery({ query, folderId, mimeType }: SearchQueryParams): string {
    const parts: string[] = [];
    const q = query?.trim();
    if (q) {
        const isSyntax =
            /\b(contains|in parents|in owners|in writers|in readers|has \{)|[=<>]|\b(trashed|starred|sharedWithMe)\b/.test(
                q,
            );
        parts.push(isSyntax ? `(${q})` : `fullText contains ${quote(q)}`);
    }

    if (folderId) {
        parts.push(`${quote(folderId)} in parents`);
    }

    if (mimeType) {
        parts.push(`mimeType = ${quote(mimeType)}`);
    }

    if (!/\btrashed\b/.test(q ?? '')) {
        parts.push('trashed = false');
    }

    return parts.join(' and ');
}

const ALIASES: Record<string, string> = {
    folder: FOLDER,
    doc: DOCUMENT,
    document: DOCUMENT,
    sheet: SPREADSHEET,
    spreadsheet: SPREADSHEET,
    slides: PRESENTATION,
    presentation: PRESENTATION,
    drawing: DRAWING,
    pdf: 'application/pdf',
};

/**
 * A MIME type, or one of the short names (`folder`, `doc`, `sheet`, `slides`, `drawing`, `pdf`).
 * @__NO_SIDE_EFFECTS__
 */
export function mimeTypeFrom(value: string): string {
    return ALIASES[value.trim().toLowerCase()] ?? value.trim();
}
