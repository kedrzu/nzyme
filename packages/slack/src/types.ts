import type { KnownBlock } from '@slack/web-api';

/**
 * Represents text content for Slack messages that can be a string, array of strings, or falsy values
 */
export type SlackText = string | (string | false | null | undefined)[];

/**
 * Alias for Slack's KnownBlock type for better readability
 */
export type SlackBlock = KnownBlock;
