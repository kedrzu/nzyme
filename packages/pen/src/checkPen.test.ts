import { readFileSync } from 'node:fs';

import { expect, test } from 'bun:test';

import type { PenProblem } from './checkPen.js';
import { checkPen } from './checkPen.js';
import type { PenDocument, PenNode } from './PenDocument.js';
import { parsePen, serializePen, walkPen } from './PenDocument.js';

const FIXTURE = readFileSync(new URL('./__fixtures__/document.pen', import.meta.url), 'utf8');

test('a sound document passes, text and names starting with "$" included', () => {
    expect(checkPen(FIXTURE)).toEqual([]);
});

test('conflict markers fail the check with their line', () => {
    const lines = FIXTURE.split('\n');
    const text = [...lines.slice(0, 3), '<<<<<<< ours', '=======', '>>>>>>> theirs', ...lines.slice(3)].join('\n');

    expect(checkPen(text).map(problem => problem.message)).toEqual([
        'line 4: merge conflict marker <<<<<<<',
        'line 5: merge conflict marker =======',
        'line 6: merge conflict marker >>>>>>>',
    ]);
});

test('invalid JSON fails the check', () => {
    const [problem] = checkPen(FIXTURE.slice(0, -1));

    expect(problem?.severity).toBe('error');
    expect(problem?.message).toStartWith('not a valid Pen document: ');
});

test('an unknown version is a warning, not an error', () => {
    const expected: PenProblem[] = [
        { severity: 'warning', nodeId: null, message: 'unknown format version 3.0 (known: 2.22)' },
    ];

    expect(check(doc => (doc.version = '3.0'))).toEqual(expected);
});

test('a duplicate id fails the check, also between the canvas and an override subtree', () => {
    const problems = check((_doc, node) => (node('promoText').id = 'tagIcon'));

    expect(problems).toEqual([error('tagIcon', 'duplicate id: another node already uses it')]);
});

test('an id containing "/" fails the check', () => {
    const problems = check((_doc, node) => (node('tagIcon').id = 'tag/icon'));

    expect(problems).toEqual([error('tag/icon', 'id contains "/", which joins ids into override paths')]);
});

test('an instance of a missing node or of a node that is not a component fails the check', () => {
    const problems = check((_doc, node) => {
        node('saveButton').ref = 'nowhere';
        node('promoCard').ref = 'row';
    });

    expect(problems).toEqual([
        error('saveButton', 'instance of missing node "nowhere"'),
        error('promoCard', 'instance of node "row", which is not a component (no `reusable: true`)'),
    ]);
});

test('an undefined variable fails the check wherever it is bound', () => {
    const problems = check((doc, node) => {
        node('row').stroke = { align: 'inside', fill: '$missing' };
        node('saveButton').descendants = { label: { fill: '$gone' } };
        node('promoText').fill = '$absent';
        doc.variables = { ...doc.variables, alias: { type: 'color', value: '$nothing' } };
    });

    expect(problems).toEqual([
        error('row', 'stroke.fill refers to undefined variable $missing'),
        error('saveButton', 'descendants["label"].fill refers to undefined variable $gone'),
        error('promoText', 'fill refers to undefined variable $absent'),
        { severity: 'error', nodeId: null, message: 'variable "alias" refers to undefined variable $nothing' },
    ]);
});

/**
 * Checks the fixture after `change`. `node(id)` finds a node on the canvas or in an override
 * subtree of the parsed copy, which `change` may edit in place.
 */
function check(change: (doc: PenDocument, node: (id: string) => PenNode) => void) {
    const doc = parsePen(FIXTURE);
    const nodes = [...walkPen(doc)].map(entry => entry.node);

    change(doc, id => nodes.find(node => node.id === id)!);
    return checkPen(serializePen(doc));
}

function error(nodeId: string, message: string): PenProblem {
    return { severity: 'error', nodeId, message };
}
