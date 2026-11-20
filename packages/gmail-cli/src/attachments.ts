// Identifying and naming message attachments for saving them to disk.
//
// Gmail issues a NEW body.attachmentId on every messages.get, so an id handed
// out when reading a message never matches a later fetch of the same message. The MIME
// partId ("1", "2.1") is stable, so that is the id the commands expose.

export interface MessageAttachment {
    partId: string;
    /** body.attachmentId of the fetch it came from, for download only. */
    gmailId: string;
    filename: string;
    mimeType: string;
    size: number;
}

/**
 * Finds an attachment by its part id, or by the Gmail attachment id of the same fetch.
 * @__NO_SIDE_EFFECTS__
 */
export function findAttachment(all: MessageAttachment[], ref: string): MessageAttachment | undefined {
    return all.find(a => a.partId === ref || a.gmailId === ref);
}

/**
 * Replaces the characters that are illegal on disk. Gmail filenames can contain slashes
 * (e.g. "2025-FP/I/27707.pdf"); a name of dots alone (`..`) would name a directory, not a file.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function safeFileName(name: string): string {
    const safe = name.replace(/[/\\:*?"<>|]/g, '_');
    return /^\.*$/.test(safe) ? 'attachment' : safe;
}

/**
 * On-disk name, unique within the message: two parts called "image.png" must
 * not overwrite each other, while saving the same part twice stays idempotent.
 * @__NO_SIDE_EFFECTS__
 */
export function savedFileName(target: MessageAttachment, all: MessageAttachment[]): string {
    const name = safeFileName(target.filename);
    const clash = all.some(a => a.partId !== target.partId && safeFileName(a.filename) === name);
    if (!clash) {
        return name;
    }
    const dot = name.lastIndexOf('.');
    const suffix = `-part${target.partId}`;
    return dot > 0 ? name.slice(0, dot) + suffix + name.slice(dot) : name + suffix;
}
