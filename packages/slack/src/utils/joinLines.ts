import type { SlackText } from '../types.js';

/**
 * Joins an array of text items with newline characters, filtering out falsy values
 *
 * @param text The text to join, either array or single string
 * @returns Joined string with newlines between items
 */
export function joinLines(text: SlackText) {
    return Array.isArray(text) ? text.filter(Boolean).join('\n') : text;
}
