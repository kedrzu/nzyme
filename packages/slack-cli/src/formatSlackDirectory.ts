import { filterNotNull } from '@nzyme/utils/array/filterNotNull.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

import type { SlackDirectoryEntry } from '@nzyme/slack/utils/fetchSlackDirectory.js';

/**
 * Renders directory entries (people and/or channels) as the one shared plain-text line format the
 * whole `slack` command group uses: identifier first so the agent can pass it straight back into a
 * later command, description last. Used by `people`/`channels` to print search results and by
 * `resolveSlackTarget`'s callers to print the candidates of an ambiguous target — same format either
 * way, since the reader is an LLM (or a human debugging by hand), never a script.
 */
export function formatSlackDirectory(entries: SlackDirectoryEntry[]): string[] {
    return entries.map(formatEntry);
}

function formatEntry(entry: SlackDirectoryEntry): string {
    switch (entry.kind) {
        case 'person':
            return formatPerson(entry);
        case 'channel':
            return formatChannel(entry);
        default:
            return assertNever(entry, 'Unhandled Slack directory entry kind');
    }
}

function formatPerson(person: Extract<SlackDirectoryEntry, { kind: 'person' }>): string {
    const name = person.displayName ?? person.realName ?? person.firstName ?? person.handle;
    const details = filterNotNull([name, person.email, person.title]).join(' · ');

    return `@${person.handle}  ${person.id}  ${details}`;
}

function formatChannel(channel: Extract<SlackDirectoryEntry, { kind: 'channel' }>): string {
    const visibility = channel.isPrivate ? 'private' : 'public';
    const memberCount = channel.memberCount != null ? `${channel.memberCount} members` : undefined;
    const description = channel.purpose ?? channel.topic;
    const details = filterNotNull([visibility, memberCount, description]).join(' · ');

    return `#${channel.name}  ${channel.id}  ${details}`;
}
