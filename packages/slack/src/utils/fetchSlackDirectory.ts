import type { ConversationsListResponse, UsersListResponse, WebClient } from '@slack/web-api';

/** The subset of `WebClient` the directory needs — narrow enough that a test can pass a plain fake. */
export interface SlackDirectoryClient {
    users: Pick<WebClient['users'], 'list' | 'lookupByEmail'>;
    conversations: Pick<WebClient['conversations'], 'list'>;
}

type SlackApiMember = NonNullable<UsersListResponse['members']>[number];
type SlackApiChannel = NonNullable<ConversationsListResponse['channels']>[number];

/** A human directory entry, normalised from `users.list`. */
export interface SlackPersonEntry {
    kind: 'person';
    id: string;
    /** The raw Slack username (`@handle`), distinct from any display name. */
    handle: string;
    firstName: string | undefined;
    realName: string | undefined;
    displayName: string | undefined;
    email: string | undefined;
    /** Profile title/role. Empty for every user in this workspace as of 2026-09-21 — matched anyway
     *  since it costs nothing, but nothing may depend on it being present. */
    title: string | undefined;
}

/** A channel directory entry, normalised from `conversations.list`. */
export interface SlackChannelEntry {
    kind: 'channel';
    id: string;
    name: string;
    isPrivate: boolean;
    memberCount: number | undefined;
    purpose: string | undefined;
    topic: string | undefined;
}

export type SlackDirectoryEntry = SlackPersonEntry | SlackChannelEntry;

export interface SlackDirectory {
    people: SlackPersonEntry[];
    channels: SlackChannelEntry[];
}

/**
 * Caches the fetched directory per client instance so `people`, `channels` and `resolveSlackTarget`
 * all search the same snapshot instead of each re-paginating `users.list`/`conversations.list` —
 * scoped to a single process run, per the design's "no disk state beyond the token" constraint.
 */
// oxlint-disable-next-line nzyme/no-module-state -- keyed by the client object, which owns the entry's lifetime: a new client never sees another's snapshot
const directoryCache = new WeakMap<SlackDirectoryClient, Promise<SlackDirectory>>();

/** Fetches the whole people + channel directory, paginating both lists to completion. */
export function fetchSlackDirectory(client: SlackDirectoryClient): Promise<SlackDirectory> {
    const cached = directoryCache.get(client);
    if (cached) {
        return cached;
    }

    const promise = loadSlackDirectory(client);
    directoryCache.set(client, promise);
    return promise;
}

/**
 * Filters people by a case-insensitive substring match against every field an agent might search
 * by: first/real/display name, handle, email, and profile title.
 * @__NO_SIDE_EFFECTS__
 */
export function filterSlackPeople(people: SlackPersonEntry[], query: string): SlackPersonEntry[] {
    const needle = query.trim().toLowerCase();
    return people.filter(person =>
        matchesAnyField(needle, [
            person.firstName,
            person.realName,
            person.displayName,
            person.handle,
            person.email,
            person.title,
        ]),
    );
}

/**
 * Filters channels by a case-insensitive substring match against name, purpose and topic — the
 * fields that actually carry what a channel is for.
 * @__NO_SIDE_EFFECTS__
 */
export function filterSlackChannels(channels: SlackChannelEntry[], query: string): SlackChannelEntry[] {
    const needle = query.trim().toLowerCase();
    return channels.filter(channel => matchesAnyField(needle, [channel.name, channel.purpose, channel.topic]));
}

async function loadSlackDirectory(client: SlackDirectoryClient): Promise<SlackDirectory> {
    const [people, channels] = await Promise.all([fetchAllPeople(client), fetchAllChannels(client)]);
    return { people, channels };
}

/** Pages through `users.list` to completion — a silently truncated directory resolves the wrong person. */
async function fetchAllPeople(client: SlackDirectoryClient): Promise<SlackPersonEntry[]> {
    const people: SlackPersonEntry[] = [];
    let cursor: string | undefined;

    do {
        const response = await client.users.list({ cursor, limit: 200 });
        for (const member of response.members ?? []) {
            const entry = toPersonEntry(member);
            if (entry) {
                people.push(entry);
            }
        }
        cursor = response.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return people;
}

/** Pages through `conversations.list` to completion, including private channels the token can see. */
async function fetchAllChannels(client: SlackDirectoryClient): Promise<SlackChannelEntry[]> {
    const channels: SlackChannelEntry[] = [];
    let cursor: string | undefined;

    do {
        const response = await client.conversations.list({
            cursor,
            limit: 200,
            exclude_archived: true,
            types: 'public_channel,private_channel',
        });
        for (const channel of response.channels ?? []) {
            const entry = toChannelEntry(channel);
            if (entry) {
                channels.push(entry);
            }
        }
        cursor = response.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return channels;
}

/**
 * Drops bots, Slackbot and deleted accounts — none of them are someone the agent can write to.
 * Slackbot itself reports `is_bot: false`, so it needs its own id check.
 */
function toPersonEntry(member: SlackApiMember): SlackPersonEntry | undefined {
    if (!member.id || !member.name || member.deleted || member.is_bot || member.id === 'USLACKBOT') {
        return undefined;
    }

    return {
        kind: 'person',
        id: member.id,
        handle: member.name,
        firstName: emptyToUndefined(member.profile?.first_name),
        realName: emptyToUndefined(member.real_name),
        displayName: emptyToUndefined(member.profile?.display_name),
        email: emptyToUndefined(member.profile?.email),
        title: emptyToUndefined(member.profile?.title),
    };
}

function toChannelEntry(channel: SlackApiChannel): SlackChannelEntry | undefined {
    if (!channel.id || !channel.name) {
        return undefined;
    }

    return {
        kind: 'channel',
        id: channel.id,
        name: channel.name,
        isPrivate: channel.is_private ?? false,
        memberCount: channel.num_members,
        purpose: emptyToUndefined(channel.purpose?.value),
        topic: emptyToUndefined(channel.topic?.value),
    };
}

function matchesAnyField(needle: string, fields: (string | undefined)[]): boolean {
    return fields.some(field => field != null && field.toLowerCase().includes(needle));
}

function emptyToUndefined(value: string | undefined): string | undefined {
    return value && value.trim() !== '' ? value : undefined;
}
