import { expect, test } from 'bun:test';
import { assertLabelRules, planThreadChange, protectedLabels, RuleViolation, viewQuery } from './labelRules.js';
import type { GmailLabelRules } from './labelRules.js';

const umbra: GmailLabelRules = {
    groups: {
        status: ['AI/Done', 'AI/Triage'],
        priority: ['P/0', 'P/1', 'P/2', 'P/3'],
    },
    require: [{ when: 'AI/Done', group: 'priority' }],
    archiveMarkers: ['Nieaktualne', 'Śmieci'],
    views: { unprocessed: '-label:AI/Done -label:AI/Triage', triage: 'label:AI/Triage' },
};

const plan = (
    change: Partial<{ add: string[]; remove: string[]; set: Record<string, string | null> }>,
    current: string[],
    rules = umbra,
) => planThreadChange({ rules, change: { add: [], remove: [], set: {}, ...change }, current });

test('assertLabelRules: accepts a well-formed config', () => {
    expect(() => assertLabelRules(umbra)).not.toThrow();
});

test('assertLabelRules: rejects overlapping groups, unknown groups, group markers and bad names', () => {
    expect(() => assertLabelRules({ groups: { a: ['X', 'Y'], b: ['x'] } })).toThrow(/'x' is already in group 'a'/);
    expect(() => assertLabelRules({ groups: { a: ['X'] }, require: [{ when: 'X', group: 'nope' }] })).toThrow(
        /unknown group 'nope'/,
    );
    expect(() => assertLabelRules({ groups: { a: ['X', 'Y'] }, archiveMarkers: ['Y'] })).toThrow(/archiveMarkers: 'Y'/);
    expect(() => assertLabelRules({ groups: { 'bad=name': ['Z'] } })).toThrow(/bad=name/);
    expect(() => assertLabelRules({ views: { 'bad view': 'in:inbox' } })).toThrow(/bad view/);
});

test('planThreadChange - groups: sets a label and strips the rest of its group present on the thread', () => {
    const p = plan({ set: { status: 'AI/Done', priority: 'P/2' } }, ['INBOX', 'AI/Triage', 'P/0']);
    expect(p.add).toEqual(['AI/Done', 'P/2']);
    expect(p.remove).toEqual(['AI/Triage', 'P/0']);
    expect(p.setLabels).toEqual(['AI/Done', 'P/2']);
});

test('planThreadChange - groups: matches group labels case-insensitively and keeps their canonical name', () => {
    expect(plan({ set: { priority: 'p/1' } }, []).add).toEqual(['P/1']);
});

test('planThreadChange - groups: clears a group with null', () => {
    const p = plan({ set: { status: null } }, ['AI/Triage', 'INBOX']);
    expect(p.add).toEqual([]);
    expect(p.remove).toEqual(['AI/Triage']);
});

test('planThreadChange - groups: rejects group labels in --add/--remove, unknown groups and foreign values', () => {
    expect(() => plan({ add: ['AI/Done'] }, [])).toThrow('--set status=AI/Done');
    expect(() => plan({ remove: ['p/3'] }, [])).toThrow(RuleViolation);
    expect(() => plan({ set: { colour: 'red' } }, [])).toThrow(/Unknown group 'colour'/);
    expect(() => plan({ set: { priority: 'P/9' } }, [])).toThrow(
        "'P/9' is not in group 'priority' (P/0, P/1, P/2, P/3); --set priority= clears the group.",
    );
});

test('planThreadChange - require: rejects a Done thread without a priority', () => {
    expect(() => plan({ set: { status: 'AI/Done' } }, ['INBOX'])).toThrow(
        "must also carry one of group 'priority' (P/0, P/1, P/2, P/3). Pass --set priority=<label> in this call.",
    );
});

test('planThreadChange - require: accepts it when the thread already has a priority', () => {
    expect(plan({ set: { status: 'AI/Done' } }, ['P/3']).add).toEqual(['AI/Done']);
});

test('planThreadChange - require: rejects clearing the priority of a Done thread', () => {
    expect(() => plan({ set: { priority: null } }, ['AI/Done', 'P/1'])).toThrow(/priority/);
});

test('planThreadChange - require: leaves unrelated edits of a legacy thread alone', () => {
    expect(plan({ add: ['Finance'] }, ['AI/Done']).add).toEqual(['Finance']);
});

test('planThreadChange - archive markers: adding a marker removes INBOX', () => {
    const p = plan({ add: ['Nieaktualne'] }, ['INBOX']);
    expect(p.remove).toContain('INBOX');
    expect(p.summary).toContain('archived (INBOX removed)');
});

test('planThreadChange - archive markers: removing INBOX without a marker is rejected, with one it passes', () => {
    expect(() => plan({ remove: ['INBOX'] }, ['INBOX', 'Finance'])).toThrow(
        "pass --add 'Nieaktualne' or --add 'Śmieci'",
    );
    expect(plan({ remove: ['INBOX'] }, ['INBOX', 'Śmieci']).remove).toEqual(['INBOX']);
});

test('planThreadChange - archive markers: without markers archiving is free', () => {
    expect(plan({ remove: ['INBOX'] }, ['INBOX'], {}).remove).toEqual(['INBOX']);
    expect(
        planThreadChange({ rules: undefined, change: { add: ['A'], remove: ['INBOX'], set: {} }, current: [] }).remove,
    ).toEqual(['INBOX']);
});

test('views: resolves a view and rejects an unknown one', () => {
    expect(viewQuery(umbra, 'triage')).toBe('label:AI/Triage');
    expect(viewQuery(umbra, undefined)).toBe('');
    expect(() => viewQuery(umbra, 'done')).toThrow(/Views: unprocessed, triage/);
    expect(() => viewQuery(undefined, 'x')).toThrow(/no views/);
});

test('views: protects group labels and markers from cleanup', () => {
    expect(protectedLabels(umbra)).toContain('AI/Done');
    expect(protectedLabels(umbra)).toContain('Śmieci');
    expect(protectedLabels(undefined)).toEqual([]);
});
