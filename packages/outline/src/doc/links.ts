import { slugify } from './naming.js';

/** A link in local Markdown that points at a file not uploaded to Outline yet. */
export interface LocalAttachmentRef {
    /** The path as written in the document, relative to its folder. */
    path: string;
    /** The alt text or link text. */
    text: string;
    image: boolean;
}

const ID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
/** `![text](` or `[text](`: group 1 is the whole opener, group 2 the text. */
const OPENER = String.raw`(!?\[([^\]\n]*)\]\()`;
/** What may follow the target: Outline's optional `"title"` (carries image sizes), then `)`. */
const LINK_END = String.raw`((?:\s+"[^"\n]*")?\))`;

const OUTLINE_LINK = new RegExp(
    `${OPENER}(?:https?://[^/\\s)]+)?/api/attachments\\.redirect\\?id=(${ID})${LINK_END}`,
    'g',
);
const LOCAL_LINK = new RegExp(`${OPENER}([^)\\s]+)${LINK_END}`, 'g');
const LOCAL_ATTACHMENT_PATH = new RegExp(`^(?:\\./)?_attachments/(${ID})(?:-[^/]*)?$`);
const ATTACHMENTS_DIR = /^(?:\.\/)?_attachments\//;
const URL_SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i;

/**
 * Rewrites Outline attachment links (`/api/attachments.redirect?id=<id>`, also with a host in front)
 * to `_attachments/<id>-<name>` relative to the document's folder. `<name>` is the slug of the
 * link text (a trailing file extension is kept), or absent when the text leaves nothing; so the
 * path depends only on the text and `toOutlineLinks` can undo it from the id alone.
 * The absolute form is normalised to the relative one, so compare against `toOutlineLinks(toLocalLinks(remote))`
 * rather than `remote` to detect a real change.
 * @__NO_SIDE_EFFECTS__
 */
export function toLocalLinks(text: string): string {
    return text.replace(OUTLINE_LINK, (_match, opener: string, label: string, id: string, end: string) => {
        const name = attachmentName(label);
        return `${opener}_attachments/${id}${name === '' ? '' : `-${name}`}${end}`;
    });
}

/**
 * The inverse of `toLocalLinks`: `_attachments/<id>-<name>` back to
 * `/api/attachments.redirect?id=<id>`. Links without an id in the name are left alone.
 * @__NO_SIDE_EFFECTS__
 */
export function toOutlineLinks(text: string): string {
    return text.replace(LOCAL_LINK, (match, opener: string, _label: string, target: string, end: string) => {
        const id = LOCAL_ATTACHMENT_PATH.exec(target)?.[1];
        return id == null ? match : `${opener}/api/attachments.redirect?id=${id}${end}`;
    });
}

/**
 * Local images (and links into `_attachments/`) that carry no Outline id, i.e. files the agent
 * added that the push has to upload. Web URLs, anchors and links to other documents are not listed.
 * @__NO_SIDE_EFFECTS__
 */
export function findLocalAttachments(text: string): LocalAttachmentRef[] {
    const found: LocalAttachmentRef[] = [];
    for (const match of text.matchAll(LOCAL_LINK)) {
        const [, opener = '', label = '', path = ''] = match;
        const image = opener.startsWith('!');
        const isLocal = !URL_SCHEME.test(path) && !LOCAL_ATTACHMENT_PATH.test(path);
        if (isLocal && (image || ATTACHMENTS_DIR.test(path))) {
            found.push({ path, text: label, image });
        }
    }
    return found;
}

function attachmentName(label: string): string {
    const [dotExtension, extension] = /\.([a-z0-9]{2,5})$/i.exec(label.trim()) ?? [];
    if (dotExtension == null || extension == null) {
        return slugify(label, '');
    }
    const stem = slugify(label.trim().slice(0, -dotExtension.length), 'file');
    return `${stem}.${extension.toLowerCase()}`;
}
