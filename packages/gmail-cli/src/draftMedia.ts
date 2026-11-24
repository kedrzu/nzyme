import { Readable } from 'node:stream';

/**
 * The media of a draft upload. The whole RFC 822 message goes as a media upload, so multi-MB
 * attachments don't hit the size limit of a plain JSON request.
 * @__NO_SIDE_EFFECTS__
 */
export function draftMedia(message: Buffer) {
    return { mimeType: 'message/rfc822', body: Readable.from([message]) };
}
