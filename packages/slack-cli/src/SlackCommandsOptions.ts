import type { Injectable } from '@nzyme/ioc/Injectable.js';

import type { SlackAuthShape } from './defineSlackAuth.js';

/** The task the work belongs to, linked from the footer of the message that opens a thread. */
export interface SlackTaskLink {
    /** The bare task id, the link's text. */
    id: string;
    url: string;
}

/** Options of {@link defineSlackCommands}. */
export interface SlackCommandsOptions {
    /** The command path prefix, space-separated. Default `slack`. */
    prefix?: string;
    /**
     * The product's unit from `defineSlackAuth`, defined once and shared with any other code that needs
     * the developer's token.
     */
    auth: Injectable<SlackAuthShape>;
    /**
     * Resolves the task the current work belongs to, or `undefined` when there is none; `send` and
     * `edit` link it from the footer of a thread's opening message. Unset, no footer links a task.
     */
    taskLink?: () => Promise<SlackTaskLink | undefined>;
}

/** What every Slack command is defined with. */
export interface SlackCommandParams {
    /** The command path prefix, space-separated (`slack`). */
    prefix: string;
    auth: Injectable<SlackAuthShape>;
    taskLink?: () => Promise<SlackTaskLink | undefined>;
}
