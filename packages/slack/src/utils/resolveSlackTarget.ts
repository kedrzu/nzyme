import { WebAPIPlatformError } from '@slack/web-api';

import { assert } from '@nzyme/utils/assert.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

import type {
    SlackChannelEntry,
    SlackDirectoryClient,
    SlackDirectoryEntry,
    SlackPersonEntry,
} from './fetchSlackDirectory.js';
import { fetchSlackDirectory, filterSlackChannels, filterSlackPeople } from './fetchSlackDirectory.js';
import { parseSlackTarget } from './parseSlackTarget.js';

/** What a target resolved to and what kind of thing it is — `send` (a later command) needs both. */
export interface ResolvedSlackTarget {
    kind: SlackDirectoryEntry['kind'];
    id: string;
}

/**
 * The outcome of resolving a target. `ambiguous` and `not_found` are both ordinary outcomes a
 * caller must handle explicitly — this type has no single "the id" field, so a caller cannot
 * accidentally read one out of an unresolved result.
 */
export type ResolveSlackTargetResult =
    | { outcome: 'resolved'; target: ResolvedSlackTarget }
    | { outcome: 'ambiguous'; candidates: SlackDirectoryEntry[] }
    | { outcome: 'not_found' };

/**
 * Turns a `slack` target argument into exactly one person or channel id, or explains why it could
 * not: several candidates matched (`ambiguous`) or none did (`not_found`). Never guesses — a caller
 * that got anything but `resolved` must stop and show the candidates rather than pick one, which is
 * the whole reason this function returns a result instead of throwing or defaulting to the first
 * match. Does not open a DM conversation for a resolved person — that is `conversations.open`'s job,
 * left to the `send` command.
 */
export async function resolveSlackTarget(
    client: SlackDirectoryClient,
    input: string,
): Promise<ResolveSlackTargetResult> {
    const parsed = parseSlackTarget(input);

    switch (parsed.kind) {
        case 'id':
            return resolveFromId(parsed.id);
        case 'permalink':
            // A permalink always names the channel it lives in — its id sits in the URL, so this
            // needs no Slack call and can never be ambiguous.
            return { outcome: 'resolved', target: { kind: 'channel', id: parsed.channelId } };
        case 'email':
            return resolveByEmail(client, parsed.email);
        case 'channelName': {
            const { channels } = await fetchSlackDirectory(client);
            return pickResolution(matchExact(channels, parsed.name, channel => channel.name));
        }
        case 'handle': {
            const { people } = await fetchSlackDirectory(client);
            return pickResolution(matchExact(people, parsed.handle, person => person.handle));
        }
        case 'text': {
            const directory = await fetchSlackDirectory(client);
            const candidates: SlackDirectoryEntry[] = [
                ...filterSlackPeople(directory.people, parsed.text),
                ...filterSlackChannels(directory.channels, parsed.text),
            ];
            return pickResolution(candidates);
        }
        default:
            return assertNever(parsed, 'Unhandled parsed Slack target kind');
    }
}

/** A raw id's prefix already tells us what kind of thing it names — no Slack call needed. */
function resolveFromId(id: string): ResolveSlackTargetResult {
    switch (id.charAt(0)) {
        case 'U':
        case 'W':
            return { outcome: 'resolved', target: { kind: 'person', id } };
        case 'C':
        case 'G':
        case 'D':
            return { outcome: 'resolved', target: { kind: 'channel', id } };
        default:
            // Team (T) and usergroup (S) ids match the id grammar but name neither a person nor a
            // channel — nothing this command group resolves.
            return { outcome: 'not_found' };
    }
}

/** An email is unambiguous by construction, so it skips the directory search entirely. */
async function resolveByEmail(client: SlackDirectoryClient, email: string): Promise<ResolveSlackTargetResult> {
    try {
        const response = await client.users.lookupByEmail({ email });
        assert(response.user?.id, 'users.lookupByEmail succeeded without a user id in its response');
        return { outcome: 'resolved', target: { kind: 'person', id: response.user.id } };
    } catch (error) {
        if (error instanceof WebAPIPlatformError && error.data.error === 'users_not_found') {
            return { outcome: 'not_found' };
        }
        throw error;
    }
}

function matchExact<T extends SlackPersonEntry | SlackChannelEntry>(
    entries: T[],
    needle: string,
    field: (entry: T) => string,
): T[] {
    const target = needle.toLowerCase();
    return entries.filter(entry => field(entry).toLowerCase() === target);
}

/** The single choke point every branch above funnels through — the `Must protect` guarantee lives here. */
function pickResolution(candidates: SlackDirectoryEntry[]): ResolveSlackTargetResult {
    if (candidates.length === 0) {
        return { outcome: 'not_found' };
    }
    if (candidates.length > 1) {
        return { outcome: 'ambiguous', candidates };
    }

    const [entry] = candidates;
    assert(entry, 'candidates.length === 1 but destructuring produced no entry');
    return { outcome: 'resolved', target: { kind: entry.kind, id: entry.id } };
}
