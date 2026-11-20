import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import { assert } from '@nzyme/utils/assert.js';

import { GmailClientFactory } from './GmailClientFactory.js';
import type { GmailCommandParams } from './GmailCommandsOptions.js';
import { protectedLabels } from './labelRules.js';
import { formatTsvLine } from './utils/formatTsvLine.js';

/**
 * Defines `<prefix> labels cleanup <prefix> [--dry-run]`: deletes the user labels whose name starts
 * with the prefix and that no message carries. A label with messages, or one the label rules depend
 * on, is skipped and reported.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGmailLabelsCleanupCommand(params: GmailCommandParams): CommandClass {
    const { prefix, labels: rules } = params;
    const kept = protectedLabels(rules).map(name => name.toLowerCase());

    return class GmailLabelsCleanupCommand extends Command {
        static override paths = [[...prefix.split(' '), 'labels', 'cleanup']];
        static override usage = Command.Usage({
            category: 'Gmail',
            description: 'Delete the empty labels under a prefix',
            details: `
                Looks at the user labels whose name starts with the prefix (case-insensitively) and
                deletes those no message carries; deleting a label never touches a message. A label
                with messages, or one in the project's label groups or archive markers, is skipped.
                Prints one line per label: \`deleted\`, \`would delete\` with \`--dry-run\`, or
                \`skipped\` with the reason.
            `,
            examples: [['See what would go', `${prefix} labels cleanup Projects/2024 --dry-run`]],
        });

        labelPrefix = Option.String({ name: 'prefix' });
        dryRun = Option.Boolean('--dry-run', false, { description: 'Report what would be deleted, delete nothing' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            // A sweep without a prefix would mean "every user label", which nobody means.
            const labelPrefix = this.labelPrefix.trim().toLowerCase();
            if (!labelPrefix) {
                throw new UsageError('The prefix is empty; it scopes which labels may be deleted.');
            }

            const { gmail, call } = await this.container.resolve(GmailClientFactory)(
                params,
                this.cli.binaryName,
                this.account,
            );
            const labels = (await gmail.users.labels.list({ userId: 'me' }, call)).data.labels ?? [];
            const matching = labels.filter(
                label => label.type === 'user' && label.name?.toLowerCase().startsWith(labelPrefix),
            );
            if (matching.length === 0) {
                this.context.stdout.write(`No user label starts with '${this.labelPrefix}'.\n`);
                return;
            }

            for (const { id, name } of matching) {
                assert(id && name, 'Gmail listed a label without an id or a name');
                if (kept.includes(name.toLowerCase())) {
                    this.context.stdout.write(formatTsvLine(['skipped', name, 'the label rules depend on it']));
                    continue;
                }

                // labels.list carries no counts; only labels.get says whether a message uses the label.
                const { messagesTotal } = (await gmail.users.labels.get({ userId: 'me', id }, call)).data;
                if (messagesTotal !== 0) {
                    this.context.stdout.write(
                        formatTsvLine(['skipped', name, `${messagesTotal ?? 'unknown'} messages`]),
                    );
                    continue;
                }

                if (!this.dryRun) {
                    await gmail.users.labels.delete({ userId: 'me', id }, call);
                }

                this.context.stdout.write(formatTsvLine([this.dryRun ? 'would delete' : 'deleted', name]));
            }
        }
    };
}
