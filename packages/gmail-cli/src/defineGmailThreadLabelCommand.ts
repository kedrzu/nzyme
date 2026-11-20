import type { gmail_v1 } from '@googleapis/gmail';

import { Option, UsageError } from '@nzyme/cli-core';
import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';

import { ensureLabel } from './ensureLabel.js';
import type { GmailClient } from './GmailClientFactory.js';
import { GmailClientFactory } from './GmailClientFactory.js';
import type { GmailCommandParams } from './GmailCommandsOptions.js';
import type { PlannedChange } from './labelRules.js';
import { planThreadChange, RuleViolation } from './labelRules.js';

/** Gmail's own labels: addressed by name, never created. */
const SYSTEM_LABELS = [
    'INBOX',
    'UNREAD',
    'STARRED',
    'IMPORTANT',
    'SENT',
    'DRAFT',
    'SPAM',
    'TRASH',
    'CATEGORY_PERSONAL',
    'CATEGORY_SOCIAL',
    'CATEGORY_PROMOTIONS',
    'CATEGORY_UPDATES',
    'CATEGORY_FORUMS',
];

/**
 * Defines `<prefix> thread label <id> [--add] [--remove] [--set group=label]`: changes a thread's
 * labels in one atomic call, after checking the change against the project's label rules. A change
 * the rules forbid writes nothing and exits non-zero with the reason.
 * @__NO_SIDE_EFFECTS__
 */
export function defineGmailThreadLabelCommand(params: GmailCommandParams): CommandClass {
    const { prefix, labels: rules } = params;
    const groups = Object.entries(rules?.groups ?? {});

    return class GmailThreadLabelCommand extends Command {
        static override paths = [[...prefix.split(' '), 'thread', 'label']];
        static override usage = Command.Usage({
            category: 'Gmail',
            description: "Change a thread's labels under the project's label rules",
            details: `
                \`--add\` and \`--remove\` take label names, matched case-insensitively; a user label
                must exist (\`${prefix} labels create\`). \`--set group=label\` puts the thread in one
                label of an exclusive group and takes it out of the group's others, creating the label
                when missing; \`--set group=\` clears the group. Groups:
                ${groups.length ? groups.map(([group, members]) => `${group} (${members.join(', ')})`).join('; ') : 'none defined'}.
                ${
                    rules?.archiveMarkers?.length
                        ? `Removing INBOX needs an archive marker (${rules.archiveMarkers.join(', ')}); adding one removes INBOX.`
                        : ''
                }
                The rules are checked before anything is written; a refused change exits 1 with the
                reason.
            `,
            examples: [['Add a label', `${prefix} thread label 18c2f0a1b2c3d4e5 --add Clients/Acme`]],
        });

        id = Option.String({ name: 'id' });
        add = Option.Array('--add', [], { description: 'A label to add; repeatable' });
        remove = Option.Array('--remove', [], { description: 'A label to remove; repeatable' });
        set = Option.Array('--set', [], { description: 'group=label, or group= to clear; repeatable' });
        account = Option.String('--account', { description: 'The account to act as; needed when several are usable' });

        override async run() {
            const set = parseSet(this.set);
            if (this.add.length === 0 && this.remove.length === 0 && Object.keys(set).length === 0) {
                throw new UsageError('Pass --add, --remove or --set.');
            }

            const client = await this.container.resolve(GmailClientFactory)(params, this.cli.binaryName, this.account);
            const { gmail, call } = client;
            const labels = (await gmail.users.labels.list({ userId: 'me' }, call)).data.labels ?? [];

            // The rules reason over the thread's resulting state, so read its labels first.
            const current = rules ? await readThreadLabels(client, this.id, labels) : [];
            const plan = this.plan(set, current);

            // Every name resolves before anything is written: a typo creates no label.
            const removeIds = plan.remove.map(name => labelId(labels, name));
            const plainIds = plan.add.filter(name => !plan.setLabels.includes(name)).map(name => labelId(labels, name));
            const setIds: string[] = [];
            for (const name of plan.setLabels) {
                setIds.push((await ensureLabel(client, labels, name)).id);
            }

            const addIds = [...plainIds, ...setIds];
            await gmail.users.threads.modify(
                {
                    userId: 'me',
                    id: this.id,
                    requestBody: {
                        addLabelIds: addIds.length > 0 ? addIds : undefined,
                        removeLabelIds: removeIds.length > 0 ? removeIds : undefined,
                    },
                },
                call,
            );

            this.context.stdout.write(`Thread updated: ${this.id} (${plan.summary.join('; ')})\n`);
        }

        private plan(set: Record<string, string | null>, current: string[]): PlannedChange {
            try {
                return planThreadChange(rules, { add: this.add, remove: this.remove, set }, current);
            } catch (error) {
                if (error instanceof RuleViolation) {
                    throw new UsageError(error.message);
                }

                throw error;
            }
        }
    };
}

/** The names of the labels on any message of the thread. */
async function readThreadLabels({ gmail, call }: GmailClient, threadId: string, labels: gmail_v1.Schema$Label[]) {
    const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'minimal' }, call);
    const names = new Set<string>();
    for (const message of thread.data.messages ?? []) {
        for (const id of message.labelIds ?? []) {
            names.add(labels.find(label => label.id === id)?.name ?? id);
        }
    }

    return [...names];
}

/** `--set` entries as the thread change's `set`: `group=label`, or `group=` to clear the group. */
function parseSet(entries: string[]): Record<string, string | null> {
    const set: Record<string, string | null> = {};
    for (const entry of entries) {
        const separator = entry.indexOf('=');
        if (separator <= 0) {
            throw new UsageError(`--set takes group=label or group=, got '${entry}'.`);
        }

        const value = entry.slice(separator + 1).trim();
        set[entry.slice(0, separator).trim()] = value || null;
    }

    return set;
}

/** A label's id by name. System labels pass through; a user label must exist, so a typo spawns no label. */
function labelId(labels: gmail_v1.Schema$Label[], name: string): string {
    if (SYSTEM_LABELS.includes(name.toUpperCase())) {
        return name.toUpperCase();
    }

    const label = labels.find(entry => entry.name?.toLowerCase() === name.toLowerCase());
    if (label?.id) {
        return label.id;
    }

    const available = labels
        .filter(entry => entry.type === 'user')
        .map(entry => entry.name)
        .join(', ');
    throw new UsageError(
        `Label '${name}' not found; create it with labels create. User labels: ${available || 'none'}.`,
    );
}
