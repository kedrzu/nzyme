import { describe, expect, test } from 'bun:test';

import { SLACK_AGENT_MARKER } from './buildSlackFooter.js';
import { selectMessagesAfter, selectOwnMessageBaseline } from './selectMessagesAfter.js';
import type { SlackTimestampedMessage } from './selectMessagesAfter.js';

const AGENT_TEXT = `${SLACK_AGENT_MARKER} <@U0APV67CQKT>\nSome question`;
// What Slack ACTUALLY returns in `text` when this same message is read back via
// conversations.replies (verified live 2026-09-21): the marker's leading emoji comes back as its
// `:robot_face:` shortcode, not the literal emoji `buildSlackMessage` sent. A check against the
// literal marker would never match a message read back from the API at all.
const AGENT_TEXT_AS_ECHOED_BY_SLACK = AGENT_TEXT.replace('🤖', ':robot_face:');
const HUMAN_TEXT = 'Just a reply typed in Slack';

function message(ts: string, text: string | undefined): SlackTimestampedMessage {
    return { ts, text };
}

describe('selectMessagesAfter', () => {
    test('excludes messages at or before the baseline, includes only ones strictly after it', () => {
        const messages = [message('1700000000.000000', AGENT_TEXT), message('1700000001.000000', HUMAN_TEXT)];

        expect(selectMessagesAfter(messages, '1700000000.000000')).toEqual([message('1700000001.000000', HUMAN_TEXT)]);
    });

    // The core "Must protect" case: the agent and the developer post from the same Slack account, so
    // a reply is anything posted after the baseline, including a message carrying the agent marker —
    // that is how the developer steers a conversation his own agent is having.
    test('includes a marker-carrying message posted after the baseline', () => {
        const messages = [message('1700000005.000000', AGENT_TEXT)];

        expect(selectMessagesAfter(messages, '1700000000.000000')).toEqual(messages);
    });

    test('compares numerically, not as strings, at the microsecond boundary', () => {
        const messages = [message('1789987660.20406', HUMAN_TEXT)];

        expect(selectMessagesAfter(messages, '1789987660.204059')).toEqual(messages);
        expect(selectMessagesAfter(messages, '1789987660.20406')).toEqual([]);
    });

    test('returns an empty array when nothing is newer than the baseline', () => {
        const messages = [message('1700000000.000000', AGENT_TEXT)];

        expect(selectMessagesAfter(messages, '1700000005.000000')).toEqual([]);
    });
});

describe('selectOwnMessageBaseline', () => {
    test('falls back to the thread root ts when nothing in the thread carries the agent marker', () => {
        const messages = [message('1700000000.000000', HUMAN_TEXT)];

        expect(selectOwnMessageBaseline(messages, '1699999999.000000')).toBe('1699999999.000000');
    });

    // Uses the shortcode-echoed form throughout this describe block — what `conversations.replies`
    // actually returns, not the literal payload `buildSlackMessage` sent (see
    // AGENT_TEXT_AS_ECHOED_BY_SLACK above). A check against the literal marker passes against a
    // hand-built fixture but silently never matches live data — this is what catches that.
    test('picks the opening message when it is the only one carrying the marker', () => {
        const messages = [
            message('1700000000.000000', AGENT_TEXT_AS_ECHOED_BY_SLACK),
            message('1700000001.000000', HUMAN_TEXT),
        ];

        expect(selectOwnMessageBaseline(messages, '1700000000.000000')).toBe('1700000000.000000');
    });

    // The regression this whole task exists to catch: a reply the developer types directly in Slack
    // carries the SAME Slack author id as a message the tool posts (D10) — author id can never tell
    // them apart. Only the marker can, and this is the scenario where it matters: the thread already
    // holds a genuine reply (no marker) by the time `wait` re-arms, and it must be returned, not
    // hidden behind a stale baseline.
    test('an already-landed human reply (no marker) is detected, not swallowed as the baseline', () => {
        const opening = message('1700000000.000000', AGENT_TEXT_AS_ECHOED_BY_SLACK);
        const reply = message('1700000010.000000', HUMAN_TEXT);
        const messages = [opening, reply];

        const baseline = selectOwnMessageBaseline(messages, opening.ts);
        expect(baseline).toBe(opening.ts);
        expect(selectMessagesAfter(messages, baseline)).toEqual([reply]);
    });

    // The re-arm regression on the other side: the agent posted its own follow-up (still carries the
    // marker) before the process restarted. Baselining on the opening message would make that
    // follow-up look like the reply on the next `selectMessagesAfter` call — baselining on the LATEST
    // marker-carrying message instead means the follow-up is excluded (it is not after itself), so
    // only a genuinely new, marker-less message counts.
    test('picks the latest agent-marked message, not the opening one, when the agent posted a follow-up', () => {
        const opening = message('1700000000.000000', AGENT_TEXT_AS_ECHOED_BY_SLACK);
        const followUp = message('1700000010.000000', AGENT_TEXT_AS_ECHOED_BY_SLACK);
        const messages = [opening, followUp];

        const baseline = selectOwnMessageBaseline(messages, opening.ts);
        expect(baseline).toBe(followUp.ts);

        // And feeding that baseline back into selectMessagesAfter must not resurrect the follow-up
        // itself as "the reply" — it is exactly at the baseline, not after it.
        expect(selectMessagesAfter(messages, baseline)).toEqual([]);
    });

    test('an actual reply posted after the own follow-up is still detected', () => {
        const opening = message('1700000000.000000', AGENT_TEXT_AS_ECHOED_BY_SLACK);
        const followUp = message('1700000010.000000', AGENT_TEXT_AS_ECHOED_BY_SLACK);
        const reply = message('1700000020.000000', HUMAN_TEXT);
        const messages = [opening, followUp, reply];

        const baseline = selectOwnMessageBaseline(messages, opening.ts);
        expect(selectMessagesAfter(messages, baseline)).toEqual([reply]);
    });
});
