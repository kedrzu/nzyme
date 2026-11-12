import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import type { PenIndexEntry } from './PenDocument.js';
import { indexPen, parsePen, serializePen, walkPen } from './PenDocument.js';

/** Written the way Pen writes a file: two-space JSON, keys in Pen's order, no trailing newline. */
const FIXTURE = readFileSync(new URL('./__fixtures__/document.pen', import.meta.url), 'utf8');

test('a parsed document serializes back to its input byte for byte', () => {
    expect(FIXTURE.endsWith('}')).toBe(true);
    expect(serializePen(parsePen(FIXTURE), FIXTURE)).toBe(FIXTURE);
    expect(serializePen(parsePen(FIXTURE))).toBe(FIXTURE);
});

test('a serialized document keeps the trailing newline of the text it came from', () => {
    for (const text of [`${FIXTURE}\n`, `${FIXTURE}\r\n`]) {
        expect(serializePen(parsePen(text), text)).toBe(text);
    }
});

test('the index records parent, position and top-level frame of every canvas node', () => {
    const index = indexPen(parsePen(FIXTURE));

    const screen = { id: 'screen', name: 'Screen · Inbox' };
    expect(pick(index.get('tagIcon'))).toEqual({ parentId: 'row', index: 1, frame: screen });
    expect(pick(index.get('promoCard'))).toEqual({ parentId: 'screen', index: 2, frame: screen });
    expect(pick(index.get('components'))).toEqual({
        parentId: null,
        index: 1,
        frame: { id: 'components', name: 'Components' },
    });
    expect(index.get('slot')?.node.slot).toEqual(['button']);

    // Override subtrees are not on the canvas.
    expect(index.has('saveDot')).toBe(false);
    expect(index.has('slotButton')).toBe(false);
});

test('the walk visits override subtrees, flagged with the instance and path they come from', () => {
    const visited = [...walkPen(parsePen(FIXTURE))].map(entry => ({
        id: entry.node.id,
        parent: entry.parent?.id ?? null,
        override: entry.override ? `${entry.override.instance.id} ${entry.override.path}` : null,
    }));

    expect(visited.filter(entry => entry.override !== null)).toEqual([
        { id: 'saveDot', parent: null, override: 'saveButton icon' },
        { id: 'promoBody', parent: null, override: 'promoCard body' },
        { id: 'promoText', parent: 'promoBody', override: 'promoCard body' },
        { id: 'slotButton', parent: null, override: 'promoCard slot' },
    ]);
    expect(visited.find(entry => entry.id === 'label')).toEqual({ id: 'label', parent: 'button', override: null });
});

test('parsing rejects a node without an id, naming where it is', () => {
    const text = JSON.stringify({
        version: '2.22',
        children: [{ type: 'frame', id: 'a', children: [{ type: 'text' }] }],
    });

    expect(() => parsePen(text)).toThrow('`children[0].children[0]` has no string `id`');
});

function pick(entry: PenIndexEntry | undefined) {
    expect(entry).toBeDefined();
    return { parentId: entry!.parentId, index: entry!.index, frame: entry!.frame };
}
