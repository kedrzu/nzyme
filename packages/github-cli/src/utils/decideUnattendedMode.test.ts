import { expect, test } from 'bun:test';

import { decideUnattendedMode } from './decideUnattendedMode.js';

test('a person at a terminal with no override is asked', () => {
    expect(
        decideUnattendedMode({
            delegated: false,
            yes: false,
            isTty: true,
        }),
    ).toBe(false);
});

test('delegation alone is enough, even with a terminal attached', () => {
    expect(
        decideUnattendedMode({
            delegated: true,
            yes: false,
            isTty: true,
        }),
    ).toBe(true);
});

test('--yes alone is enough, even with a terminal attached', () => {
    expect(
        decideUnattendedMode({
            delegated: false,
            yes: true,
            isTty: true,
        }),
    ).toBe(true);
});

// No terminal means nobody could answer regardless of the other two flags - `enquirer` would
// otherwise wait forever for input that will never arrive.
test('no terminal is enough on its own, with nothing else set', () => {
    expect(
        decideUnattendedMode({
            delegated: false,
            yes: false,
            isTty: false,
        }),
    ).toBe(true);
});
