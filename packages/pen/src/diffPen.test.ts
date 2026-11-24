import fs from 'node:fs/promises';

import { expect, test } from 'bun:test';

import type { PenDiff } from './diffPen.js';
import { diffPen } from './diffPen.js';
import type { PenDocument, PenNode } from './PenDocument.js';
import { indexPen, parsePen } from './PenDocument.js';

const FIXTURE_PEN = await fs.readFile(new URL('./__fixtures__/document.pen', import.meta.url), 'utf8');

test('names every changed and moved node, and each added or removed subtree by its top, under its top-level frame', () => {
    const after = parsePen(FIXTURE_PEN);
    node(after, 'price').content = '$10 off';
    const saveButton = node(after, 'saveButton');
    saveButton.descendants = {
        label: { content: '$ Save', fill: '$fg' },
        icon: { type: 'rectangle', id: 'saveDot', width: 12, height: 8, fill: '$accent' },
    };
    remove(after, 'tagIcon');
    node(after, 'row').children?.push({
        type: 'frame',
        id: 'badge',
        name: 'Badge',
        children: [{ type: 'text', id: 'badgeText', content: 'New' }],
    });
    // The row goes last: only the row moved, though its siblings' indexes changed too.
    const screen = node(after, 'screen').children ?? [];
    screen.push(...screen.splice(0, 1));

    const expected: PenDiff = {
        frames: [
            {
                frame: { id: 'screen', name: 'Screen · Inbox' },
                added: [{ id: 'badge', name: 'Badge', type: 'frame', descendants: 1 }],
                removed: [{ id: 'tagIcon', name: null, type: 'icon', descendants: 0 }],
                changed: [
                    {
                        id: 'saveButton',
                        name: 'Save',
                        type: 'ref',
                        keys: ['descendants["label"].fill', 'descendants["icon"]'],
                    },
                    { id: 'price', name: '$ label', type: 'text', keys: ['content'] },
                ],
                moved: [
                    {
                        id: 'row',
                        name: 'Row',
                        type: 'frame',
                        from: { parentId: 'screen', index: 0 },
                        to: { parentId: 'screen', index: 2 },
                    },
                ],
            },
        ],
        variables: [],
        components: [],
        keys: [],
    };
    expect(diffPen(parsePen(FIXTURE_PEN), after)).toEqual(expected);
});

test('reports changed variables, and a component changed in its subtree with its instance count', () => {
    const after = parsePen(FIXTURE_PEN);
    after.version = '2.23';
    after.variables = {
        ...after.variables,
        bg: { type: 'color', value: '#000000' },
        danger: { type: 'color', value: '#F85149' },
    };
    delete after.variables.link;
    node(after, 'label').fill = '$bg';
    remove(after, 'screen');

    const diff = diffPen(parsePen(FIXTURE_PEN), after);

    expect(diff.variables).toEqual([
        {
            name: 'bg',
            change: 'changed',
            before: { type: 'color', value: '#0D1117' },
            after: { type: 'color', value: '#000000' },
        },
        { name: 'link', change: 'removed', before: { type: 'color', value: '#4493F8' }, after: undefined },
        { name: 'danger', change: 'added', before: undefined, after: { type: 'color', value: '#F85149' } },
    ]);
    expect(diff.keys).toEqual(['version']);
    // The screen's nodes are gone with it, so the button has no instance left.
    expect(diff.components).toEqual([
        {
            id: 'button',
            name: 'Button',
            type: 'frame',
            frame: { id: 'components', name: 'Components' },
            change: 'changed',
            instances: 0,
        },
    ]);
    expect(diff.frames.map(frame => [frame.frame.id, frame.removed, frame.changed.length])).toEqual([
        ['components', [], 1],
        ['screen', [{ id: 'screen', name: 'Screen · Inbox', type: 'frame', descendants: 5 }], 0],
    ]);
});

test('counts instances of a changed component, those inside override subtrees included', () => {
    const after = parsePen(FIXTURE_PEN);
    node(after, 'button').cornerRadius = 8;

    expect(diffPen(parsePen(FIXTURE_PEN), after).components).toMatchObject([
        { id: 'button', change: 'changed', instances: 2 },
    ]);
});

function node(doc: PenDocument, id: string): PenNode {
    const entry = indexPen(doc).get(id);
    if (!entry) {
        throw new Error(`no node ${id}`);
    }
    return entry.node;
}

function remove(doc: PenDocument, id: string) {
    const parentId = indexPen(doc).get(id)?.parentId;
    const siblings = parentId ? (node(doc, parentId).children ?? []) : doc.children;
    siblings.splice(
        siblings.findIndex(child => child.id === id),
        1,
    );
}
