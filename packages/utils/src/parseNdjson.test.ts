import { expect, test } from 'bun:test';

import { parseNdjson } from './parseNdjson.js';

test('parses every complete line and skips empty ones', () => {
    expect(parseNdjson('{"a":1}\n\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
});

test('stops at a last line cut short', () => {
    expect(parseNdjson('{"a":1}\n{"b":')).toEqual([{ a: 1 }]);
});
