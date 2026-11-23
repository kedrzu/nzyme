import { describe, expect, test } from 'bun:test';

import type { SlackChannelEntry, SlackPersonEntry } from '@nzyme/slack/utils/fetchSlackDirectory.js';

import { formatSlackDirectory } from './formatSlackDirectory.js';

function person(overrides: Partial<SlackPersonEntry> = {}): SlackPersonEntry {
    return {
        kind: 'person',
        id: 'U02FR4NK1',
        handle: 'frank',
        firstName: 'Frank',
        realName: 'Frank Miller',
        displayName: undefined,
        email: undefined,
        title: undefined,
        ...overrides,
    };
}

function channel(overrides: Partial<SlackChannelEntry> = {}): SlackChannelEntry {
    return {
        kind: 'channel',
        id: 'C12AB34CD',
        name: 'eng-platform',
        isPrivate: false,
        memberCount: undefined,
        purpose: undefined,
        topic: undefined,
        ...overrides,
    };
}

describe('formatSlackDirectory', () => {
    test('formats a person with name, email and title', () => {
        const lines = formatSlackDirectory([
            person({ realName: 'Frank Miller', email: 'frank@healed.care', title: 'Senior Engineer' }),
        ]);
        expect(lines).toEqual(['@frank  U02FR4NK1  Frank Miller · frank@healed.care · Senior Engineer']);
    });

    test('prefers display name over real name and first name', () => {
        const lines = formatSlackDirectory([
            person({ firstName: 'Frank', realName: 'Frank Miller', displayName: 'frankm' }),
        ]);
        expect(lines).toEqual(['@frank  U02FR4NK1  frankm']);
    });

    // Titles are empty for every user in this workspace today (measured 2026-09-21) — this proves a
    // missing field never leaves a dangling separator, since the field is absent for real for now.
    test('omits email and title when absent, without stray separators', () => {
        const lines = formatSlackDirectory([person({ realName: 'Frank Miller' })]);
        expect(lines).toEqual(['@frank  U02FR4NK1  Frank Miller']);
    });

    test('formats a private channel with member count and purpose', () => {
        const lines = formatSlackDirectory([
            channel({
                name: 'eng-platform',
                isPrivate: true,
                memberCount: 42,
                purpose: "Backend team's working channel",
            }),
        ]);
        expect(lines).toEqual(["#eng-platform  C12AB34CD  private · 42 members · Backend team's working channel"]);
    });

    test('falls back to topic when purpose is absent', () => {
        const lines = formatSlackDirectory([channel({ topic: 'Incident response' })]);
        expect(lines).toEqual(['#eng-platform  C12AB34CD  public · Incident response']);
    });

    test('omits the description segment entirely when neither purpose nor topic is set', () => {
        const lines = formatSlackDirectory([channel()]);
        expect(lines).toEqual(['#eng-platform  C12AB34CD  public']);
    });
});
