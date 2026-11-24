import { slugify } from './naming.js';

/** A link in local Markdown that points at a file not uploaded to Outline yet. */
export interface LocalAttachmentRef {
    /** The path as written in the document, relative to its folder. */
    path: string;
    /** The alt text or link text. */
    text: string;
    image: boolean;
}

/** Folder next to a document that holds its attachments; sync's own, so never read as documents. */
export const ATTACHMENTS_FOLDER = '_attachments';
/** `![text](` or `[text](`: group 1 is the whole opener, group 2 the text. The id is a UUID; the optional `"title"` after the target carries image sizes. */
const OUTLINE_LINK =
    /(!?\[([^\]\n]*)\]\()(?:https?:\/\/[^/\s)]+)?\/api\/attachments\.redirect\?id=([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})((?:\s+"[^"\n]*")?\))/g;
/** Any link: group 1 the opener, 2 the text, 3 the target, 4 the end. */
const LOCAL_LINK = /(!?\[([^\]\n]*)\]\()([^)\s]+)((?:\s+"[^"\n]*")?\))/g;
/** A path into the attachments folder (`_attachments`, see `ATTACHMENTS_FOLDER`) named by id: group 1 is the id. */
const LOCAL_ATTACHMENT_PATH =
    /^(?:\.\/)?_attachments\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:-[^/]*)?$/;
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
        return `${opener}${ATTACHMENTS_FOLDER}/${id}${name === '' ? '' : `-${name}`}${end}`;
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
        if (isLocalAttachment(opener, path)) {
            found.push({ path, text: label, image: opener.startsWith('!') });
        }
    }
    return found;
}

/**
 * `text` without the links `findLocalAttachments` lists, so a new document reaches Outline without them and they
 * stay the local agent's own, uploaded once their files are.
 * @__NO_SIDE_EFFECTS__
 */
export function withoutLocalAttachments(text: string): string {
    return text.replace(LOCAL_LINK, (match, opener: string, _label: string, target: string) =>
        isLocalAttachment(opener, target) ? '' : match,
    );
}

function isLocalAttachment(opener: string, path: string): boolean {
    const isLocal = !URL_SCHEME.test(path) && !LOCAL_ATTACHMENT_PATH.test(path);
    return isLocal && (opener.startsWith('!') || ATTACHMENTS_DIR.test(path));
}

/**
 * Points the local links whose target is a key of `uploaded` (as written, e.g. `_attachments/foto.png`) at the
 * Outline attachment id it maps to, in the `_attachments/<id>-<name>` form `toLocalLinks` writes, so the file the
 * link names is the one a pull would download for it. Other links are left as they are.
 * @__NO_SIDE_EFFECTS__
 */
export function linkUploadedAttachments(text: string, uploaded: ReadonlyMap<string, string>): string {
    return text.replace(LOCAL_LINK, (match, opener: string, _label: string, target: string, end: string) => {
        const id = uploaded.get(target);
        return id == null ? match : toLocalLinks(`${opener}/api/attachments.redirect?id=${id}${end}`);
    });
}

/** A link in local Markdown to an Outline attachment, in the form `toLocalLinks` writes. */
export interface OutlineAttachmentRef {
    /** The Outline attachment id. */
    id: string;
    /** `_attachments/<id>…`, relative to the document's folder, without a leading `./`. */
    path: string;
}

/**
 * The Outline attachments a local document links to (`_attachments/<id>…`), each path once: the files the
 * pull downloads next to the document.
 * @__NO_SIDE_EFFECTS__
 */
export function findOutlineAttachments(text: string): OutlineAttachmentRef[] {
    const found = new Map<string, OutlineAttachmentRef>();
    for (const match of text.matchAll(LOCAL_LINK)) {
        const target = match[3] ?? '';
        const id = LOCAL_ATTACHMENT_PATH.exec(target)?.[1];
        const path = target.replace(/^\.\//, '');
        if (id != null && !found.has(path)) {
            found.set(path, { id, path });
        }
    }
    return [...found.values()];
}

function attachmentName(label: string): string {
    const [dotExtension, extension] = /\.([a-z0-9]{2,5})$/i.exec(label.trim()) ?? [];
    if (dotExtension == null || extension == null) {
        return slugify(label, '');
    }
    const stem = slugify(label.trim().slice(0, -dotExtension.length), 'file');
    return `${stem}.${extension.toLowerCase()}`;
}
