import type { AppMentionEvent, BotMessageEvent, GenericMessageEvent } from '@slack/types';

import { blocksToMarkdown } from './blocksToMarkdown.js';

/**
 * Helper type for extracting file type from message events
 */
type File = NonNullable<GenericMessageEvent['files']>[number];

/**
 * Converts a Slack message to markdown format
 *
 * @param message Slack message event to convert
 * @returns Markdown string representation of the message
 */
export function messageToMarkdown(
    message: AppMentionEvent | BotMessageEvent | GenericMessageEvent,
) {
    let content = '';

    if (message.blocks) {
        content = blocksToMarkdown(message.blocks);
    }

    if (!content && message.text) {
        content = message.text;
    }

    if ('files' in message && message.files) {
        content = appendNewline(content);

        for (const file of message.files) {
            if (!isFile(file)) {
                continue;
            }

            content = appendNewline(content);

            // if (file.mimetype.startsWith('image/')) {
            //     content += `![${file.name}](${
            //         file.thumb_1024 ||
            //         file.thumb_960 ||
            //         file.thumb_720 ||
            //         file.thumb_480 ||
            //         file.thumb_360 ||
            //         file.permalink_public ||
            //         file.permalink
            //     })`;
            // } else {
            content += `[${file.name}](${file.permalink_public || file.permalink})`;
            // }
        }
    }

    return content;
}

/**
 * Appends a newline to content if it's not empty
 *
 * @param content String to append newline to
 * @returns String with newline appended if not empty
 */
function appendNewline(content: string) {
    if (content.length > 0) {
        return content + '\n';
    }

    return content;
}

/**
 * Type guard to check if an object is a Slack file
 *
 * @param file Object to check
 * @returns Boolean indicating if the object is a Slack file
 */
function isFile(file: File | { id: string }): file is File {
    return 'mimetype' in file;
}
