import { formatTsvLine, Option, parseCount } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { assert } from '@nzyme/utils/assert.js';

import { GmailClientFactory } from './GmailClientFactory.js';
import type { GmailCommandParams } from './GmailCommandsOptions.js';
import { getHeader } from './gmailContent.js';

/** Drafts read when filtering by thread, which Gmail cannot do itself. */
const THREAD_SCAN = 100;

/**
 * Defines `<prefix> draft list [--query] [--thread] [--limit]`: one line per draft,
 * `draftId  threadId  date  to  subject  reply|new`, tab-separated.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGmailDraftListCommand(params: GmailCommandParams): CommandClass {
    const { prefix } = params;

    return class GmailDraftListCommand extends Command {
        static override paths = [[...prefix.split(' '), 'draft', 'list']];
        static override usage = Command.Usage({
            category: 'Gmail',
            description: 'List drafts',
            details: `
                Prints one tab-separated line per draft, newest first: its id, thread, date,
                recipients, subject, and \`reply\` or \`new\`. \`--query\` filters with Gmail search
                syntax, \`--thread\` keeps the drafts of one thread. Read one with
                \`${prefix} draft get <id>\`.
            `,
        });

        query = Option.String('--query', { description: 'A Gmail search query' });
        thread = Option.String('--thread', { description: 'Only the drafts of this thread' });
        limit = Option.String('--limit', '20', { description: 'The most drafts to list' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const limit = parseCount({ value: this.limit, option: '--limit' });

            const { gmail, call } = await this.container.resolve(GmailClientFactory)(
                params,
                this.cli.binaryName,
                this.account,
            );
            const response = await gmail.users.drafts.list(
                { userId: 'me', q: this.query, maxResults: this.thread ? THREAD_SCAN : limit },
                call,
            );
            const drafts = (response.data.drafts ?? [])
                .filter(draft => !this.thread || draft.message?.threadId === this.thread)
                .slice(0, limit);

            const details = await Promise.all(
                drafts.map(draft => {
                    assert(draft.id, 'Gmail listed a draft without an id');
                    return gmail.users.drafts.get({ userId: 'me', id: draft.id, format: 'metadata' }, call);
                }),
            );
            for (const { data } of details) {
                const headers = data.message?.payload?.headers;
                this.context.stdout.write(
                    formatTsvLine([
                        data.id ?? '',
                        data.message?.threadId ?? '',
                        getHeader(headers, 'Date'),
                        getHeader(headers, 'To'),
                        getHeader(headers, 'Subject'),
                        getHeader(headers, 'In-Reply-To') ? 'reply' : 'new',
                    ]),
                );
            }
        }
    };
}
