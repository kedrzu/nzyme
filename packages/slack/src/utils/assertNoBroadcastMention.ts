/**
 * Raised when a message body contains a broadcast mention (`@channel`, `@here`, `@everyone`).
 * Refused unconditionally — there is no allowlist of people or channels this agent may write to,
 * so a broadcast mention is the one thing that could turn a message meant for one person into an interruption for an entire channel.
 */
export class BroadcastMentionError extends Error {
    constructor() {
        super('Refused to send a message containing @channel, @here or @everyone');
        this.name = 'BroadcastMentionError';
    }
}

/** Matches `@channel`/`@here`/`@everyone` as a person would type them, before Slack's client (or a
 *  message built by hand) encodes them. The trailing `\b` keeps a different word that merely starts
 *  the same way — `@channels-list` — from matching. */
const RAW_BROADCAST_PATTERN = /@(?:channel|here|everyone)\b/i;

/** Matches Slack's own encoded form, `<!channel>`, optionally carrying the display label a pasted
 *  or forwarded message keeps (`<!channel|@channel>`). */
const ENCODED_BROADCAST_PATTERN = /<!(?:channel|here|everyone)(?:\|[^>]*)?>/i;

/**
 * Throws {@link BroadcastMentionError} if `body` would notify an entire channel rather than the
 * person the agent is writing to. Checked in both the raw and Slack-encoded spellings — a body
 * assembled from a quoted search result or a forwarded message can carry either — and is the single
 * choke point `buildSlackMessage` funnels every outgoing body through.
 */
export function assertNoBroadcastMention(body: string): void {
    if (RAW_BROADCAST_PATTERN.test(body) || ENCODED_BROADCAST_PATTERN.test(body)) {
        throw new BroadcastMentionError();
    }
}
