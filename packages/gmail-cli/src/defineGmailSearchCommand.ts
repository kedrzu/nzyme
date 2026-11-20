import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatTsvLine } from '@nzyme/cli-core/utils/formatTsvLine.js';
import { parseCount } from '@nzyme/cli-core/utils/parseCount.js';

import { GmailClientFactory } from './GmailClientFactory.js';
import type { GmailCommandParams } from './GmailCommandsOptions.js';
import { RuleViolation, viewQuery } from './labelRules.js';
import { getHeader } from './utils/getHeader.js';

/** Pages of 100 messages read at most before giving up on filling `--limit` threads. */
const MAX_PAGES = 5;

/**
 * Defines `<prefix> search [query] [--view] [--limit]`: one line per thread, newest matching message
 * first, `threadId  date  from  subject  (messageCount)`, tab-separated.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGmailSearchCommand(params: GmailCommandParams): CommandClass {
    const { prefix, labels } = params;
    const views = Object.keys(labels?.views ?? {});

    return class GmailSearchCommand extends Command {
        static override paths = [[...prefix.split(' '), 'search']];
        static override usage = Command.Usage({
            category: 'Gmail',
            description: 'Search email threads with Gmail search syntax',
            details: `
                Filters per message, then groups the matches into threads, newest matching message
                first: a new reply resurfaces its thread even when older messages carry labels the
                query excludes. \`--view\` runs one of the project's named queries
                (${views.length ? views.join(', ') : 'none defined'}), ANDed with the query. Prints one
                tab-separated line per thread: id, date, sender, subject and message count. Read a
                thread with \`${prefix} thread <id>\`.
            `,
            examples: [['Unread mail from one sender', `${prefix} search "is:unread from:jan@example.com"`]],
        });

        query = Option.String({ required: false, name: 'query' });
        view = Option.String('--view', { description: "One of the project's named views" });
        limit = Option.String('--limit', '20', { description: 'The most threads to list' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const limit = parseCount({ value: this.limit, option: '--limit' });

            const q = [this.viewQuery(), this.query].filter(Boolean).join(' ');
            if (!q) {
                throw new UsageError(`Pass a query${views.length ? ' or --view' : ''}.`);
            }

            const client = await this.container.resolve(GmailClientFactory)({
                params,
                binaryName: this.cli.binaryName,
                account: this.account,
            });
            const { gmail, call } = client;

            // Filter per message: Gmail's thread-level label negation drops a whole conversation once
            // any message has the label, so new replies to processed threads would never resurface.
            // messages.list is newest first, so first-seen order sorts threads by their newest match.
            const threadIds = new Set<string>();
            let pageToken: string | undefined;
            for (let page = 0; page < MAX_PAGES && threadIds.size < limit; page++) {
                const response = await gmail.users.messages.list({ userId: 'me', q, maxResults: 100, pageToken }, call);
                for (const message of response.data.messages ?? []) {
                    if (message.threadId && threadIds.size < limit) {
                        threadIds.add(message.threadId);
                    }
                }

                pageToken = response.data.nextPageToken ?? undefined;
                if (!pageToken) {
                    break;
                }
            }

            const threads = await Promise.all(
                [...threadIds].map(id =>
                    gmail.users.threads.get(
                        { userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] },
                        call,
                    ),
                ),
            );
            for (const { data } of threads) {
                const headers = data.messages?.[0]?.payload?.headers;
                this.context.stdout.write(
                    formatTsvLine([
                        data.id ?? '',
                        getHeader(headers, 'Date'),
                        getHeader(headers, 'From'),
                        getHeader(headers, 'Subject'),
                        `(${data.messages?.length ?? 0})`,
                    ]),
                );
            }
        }

        private viewQuery() {
            try {
                return viewQuery(labels, this.view);
            } catch (error) {
                if (error instanceof RuleViolation) {
                    throw new UsageError(error.message);
                }

                throw error;
            }
        }
    };
}
