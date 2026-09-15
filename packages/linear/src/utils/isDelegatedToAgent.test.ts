import { expect, test } from 'bun:test';

import { isDelegatedToAgent } from './isDelegatedToAgent.js';

const AGENT = 'e9840e57-282d-4135-9d25-494d5cada454';
const SOMEONE_ELSE = '7e4f6e9a-3dad-465b-a2da-087ebd265597';

test('an issue delegated to this agent authorises an unattended run', () => {
    expect(isDelegatedToAgent(AGENT, AGENT)).toBe(true);
});

test('an issue delegated to a different agent does not', () => {
    expect(isDelegatedToAgent(SOMEONE_ELSE, AGENT)).toBe(false);
});

// The whole failure mode this guard exists for: two absent values are equal to each other, so a
// naive comparison would turn every issue unattended on a machine that configured nothing.
test('neither side present is not a match', () => {
    expect(isDelegatedToAgent(undefined, undefined)).toBe(false);
});

test('an undelegated issue does not authorise an agent that knows who it is', () => {
    expect(isDelegatedToAgent(undefined, AGENT)).toBe(false);
});

test('a delegated issue does not authorise a process with no identity', () => {
    expect(isDelegatedToAgent(AGENT, undefined)).toBe(false);
});

// An empty string reaches here from an env var that is set but blank — it must not identify anyone.
test('an empty identity never matches, not even an empty delegate', () => {
    expect(isDelegatedToAgent('', '')).toBe(false);
    expect(isDelegatedToAgent(AGENT, '')).toBe(false);
    expect(isDelegatedToAgent('', AGENT)).toBe(false);
});
