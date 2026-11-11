import { assert } from '@nzyme/utils/assert.js';
import { deepEquals } from '@nzyme/utils/deepEquals.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';
import { omitProps } from '@nzyme/utils/omitProps.js';

import { findMovedItems } from './findMovedItems.js';
import type { PenDocument, PenFrameRef, PenIndexEntry, PenNode } from './PenDocument.js';
import { indexPen } from './PenDocument.js';

/** One of the two sides of a merge; the base is their common ancestor. */
export type PenMergeSide = 'ours' | 'theirs';

/** A node a conflict is on, named for a reader. */
export interface PenConflictNode {
    id: string;
    name: string | null;
    /** The top-level node it sits in, taken from ours when it exists there, else from theirs. */
    frame: PenFrameRef;
}

/** Both sides changed the same value differently; ours was kept. */
export interface PenValueConflict {
    /**
     * - `property`: a node's property;
     * - `override`: an entry of an instance's `descendants`, or one property of it;
     * - `move`: both sides moved the node to different places (the values are `{ parent, index }`);
     * - `same-id`: both sides added a node with this id and different properties;
     * - `top-level`: a key of the document, or one of its `variables`.
     */
    kind: 'property' | 'override' | 'move' | 'same-id' | 'top-level';
    /** Null for a `top-level` conflict. */
    node: PenConflictNode | null;
    /** The property, `descendants["a/b"].fill`, `variables.bg` or `version`; null for `move` and `same-id`. */
    key: string | null;
    /** `undefined` where the side has no such value (absent key, deleted entry, or a node new on both sides). */
    base: unknown;
    ours: unknown;
    theirs: unknown;
}

/** One side deleted a node (or an ancestor of it) the other edited; the node was kept as the editing side has it. */
export interface PenDeleteEditConflict {
    kind: 'delete-edit';
    node: PenConflictNode;
    deletedBy: PenMergeSide;
}

/** Something both sides changed incompatibly, settled by keeping one side and reported. */
export type PenConflict = PenValueConflict | PenDeleteEditConflict;

/** The outcome of {@link mergePen}. */
export interface PenMergeResult {
    /** The merged document: valid even with conflicts, holding ours (or the editing side) at each. */
    doc: PenDocument;
    conflicts: PenConflict[];
}

/** The canvas node of a merged document whose own properties and children are still to be built. */
interface NodePlan {
    /** Where the properties come from: merged per key, or one side's node as it is. */
    source: 'merge' | PenMergeSide;
    /** The side whose parent and position the node takes. */
    placement: PenMergeSide;
}

/** One of the three documents being merged, with its index. */
interface MergeInput {
    doc: PenDocument;
    index: Map<string, PenIndexEntry>;
}

/** The state shared by the steps of a merge. */
interface MergeContext {
    base: MergeInput;
    ours: MergeInput;
    theirs: MergeInput;
    plans: Map<string, NodePlan>;
    /** The properties of every planned node, in key order; `children` holds a placeholder. */
    props: Map<string, Map<string, unknown>>;
    /** Per side and parent (null for the document), the children it moved within that parent. */
    movedWithin: Record<PenMergeSide, Map<string | null, Set<string>>>;
    conflicts: PenConflict[];
}

/** Merges one value of three, and reports a conflict when it has to. */
type MergeValue = (key: string, base: unknown, ours: unknown, theirs: unknown) => unknown;

/**
 * Merges two descendants of `base` node by node: nodes are matched by id, a node's properties merge
 * one by one (an instance's `descendants` per override key, then per property), and child order
 * merges per parent. A change made on one side only always lands; where both sides changed the same
 * thing differently, ours is kept and a {@link PenConflict} says so. No input is modified.
 * @__NO_SIDE_EFFECTS__
 */
export function mergePen(base: PenDocument, ours: PenDocument, theirs: PenDocument): PenMergeResult {
    const ctx: MergeContext = {
        base: { doc: base, index: indexPen(base) },
        ours: { doc: ours, index: indexPen(ours) },
        theirs: { doc: theirs, index: indexPen(theirs) },
        plans: new Map(),
        props: new Map(),
        movedWithin: { ours: new Map(), theirs: new Map() },
        conflicts: [],
    };

    planNodes(ctx);
    reviveReferencedNodes(ctx);
    placeNodes(ctx);
    breakCycles(ctx);

    const doc = buildDocument(ctx);
    return { doc, conflicts: ctx.conflicts };
}

/** Decides which nodes the result holds and where their properties come from. */
function planNodes(ctx: MergeContext) {
    const { base, ours, theirs, plans } = ctx;

    for (const [id, oursEntry] of ours.index) {
        const theirsEntry = theirs.index.get(id);
        if (!theirsEntry) {
            continue;
        }

        if (base.index.has(id)) {
            plans.set(id, { source: 'merge', placement: 'ours' });
            continue;
        }

        plans.set(id, { source: 'ours', placement: 'ours' });
        if (!ownPropsEqual(oursEntry.node, theirsEntry.node)) {
            ctx.conflicts.push({
                kind: 'same-id',
                node: conflictNode(ctx, id),
                key: null,
                base: undefined,
                ours: omitProps(oursEntry.node, ['children']),
                theirs: omitProps(theirsEntry.node, ['children']),
            });
        }
    }

    for (const side of ['ours', 'theirs'] as const) {
        const other = side === 'ours' ? theirs : ours;
        const touched = findTouched(base.index, ctx[side].index);
        const revived = new Set<string>();

        for (const [id, entry] of ctx[side].index) {
            if (other.index.has(id)) {
                continue;
            }

            if (!base.index.has(id)) {
                plans.set(id, { source: side, placement: side });
                continue;
            }

            const parentRevived = entry.parentId !== null && revived.has(entry.parentId);
            if (!touched.has(id) && !parentRevived) {
                continue;
            }

            revived.add(id);
            plans.set(id, { source: side, placement: side });
            if (!parentRevived) {
                ctx.conflicts.push({ kind: 'delete-edit', node: conflictNode(ctx, id), deletedBy: otherSide(side) });
            }
        }
    }

    for (const id of plans.keys()) {
        ctx.props.set(id, mergeNodeProps(ctx, id));
    }
}

/**
 * Keeps a node one side deleted while the result still has an instance of it (the other side added
 * or kept one): an instance of a missing node breaks the file. The node comes back with its subtree
 * and any deleted ancestors, as a `delete-edit` conflict.
 */
function reviveReferencedNodes(ctx: MergeContext) {
    let pending = [...ctx.props.values()];

    while (pending.length > 0) {
        const refs = new Set<string>();
        for (const props of pending) {
            collectRefs({ ref: props.get('ref'), descendants: props.get('descendants') }, refs);
        }

        const added: string[] = [];
        for (const ref of refs) {
            if (ctx.plans.has(ref) || !ctx.base.index.has(ref)) {
                continue;
            }

            const side = ctx.ours.index.has(ref) ? 'ours' : ctx.theirs.index.has(ref) ? 'theirs' : null;
            if (side === null) {
                continue;
            }

            added.push(...reviveWithSubtree(ctx, side, ref));
            ctx.conflicts.push({ kind: 'delete-edit', node: conflictNode(ctx, ref), deletedBy: otherSide(side) });
        }

        for (const id of added) {
            ctx.props.set(id, mergeNodeProps(ctx, id));
        }

        pending = added.map(id => getProps(ctx, id));
    }
}

/** Plans `id` from `side`, with the nodes of its subtree and its ancestors that are not planned yet. */
function reviveWithSubtree(ctx: MergeContext, side: PenMergeSide, id: string): string[] {
    const index = ctx[side].index;
    const added: string[] = [];
    const subtree = [getEntry(index, id).node];

    for (let node = subtree.pop(); node; node = subtree.pop()) {
        if (!ctx.plans.has(node.id)) {
            ctx.plans.set(node.id, { source: side, placement: side });
            added.push(node.id);
        }
        subtree.push(...(node.children ?? []));
    }

    for (
        let parentId = getEntry(index, id).parentId;
        parentId !== null;
        parentId = getEntry(index, parentId).parentId
    ) {
        if (ctx.plans.has(parentId)) {
            break;
        }
        ctx.plans.set(parentId, { source: side, placement: side });
        added.push(parentId);
    }

    return added;
}

/** Decides, for each node both sides kept, whose parent and position it takes. */
function placeNodes(ctx: MergeContext) {
    for (const [id, plan] of ctx.plans) {
        if (plan.source !== 'merge') {
            continue;
        }

        const movedByOurs = isMoved(ctx, 'ours', id);
        const movedByTheirs = isMoved(ctx, 'theirs', id);

        if (movedByTheirs && !movedByOurs) {
            plan.placement = 'theirs';
        } else if (movedByOurs && movedByTheirs && !isSamePlace(ctx, id)) {
            pushMoveConflict(ctx, id);
        }
    }
}

/**
 * Settles the nodes that one side moved into a node the other side moved into them, which would
 * leave a cycle off the canvas: they keep ours' place, as a `move` conflict.
 */
function breakCycles(ctx: MergeContext) {
    const settled = new Set<string | null>([null]);

    for (const id of ctx.plans.keys()) {
        const path: string[] = [];
        let current: string | null = id;

        while (current !== null && !settled.has(current) && !path.includes(current)) {
            path.push(current);
            current = ctx.plans.has(current) ? getPlannedParent(ctx, current) : null;
        }

        if (current !== null && path.includes(current)) {
            let settledByOurs = false;
            for (const node of path.slice(path.indexOf(current))) {
                const plan = ctx.plans.get(node);
                if (plan?.placement === 'theirs' && plan.source === 'merge') {
                    plan.placement = 'ours';
                    pushMoveConflict(ctx, node);
                    settledByOurs = true;
                }
            }

            // A cycle needs a node theirs moved under one ours moved, which ours' place settles.
            if (!settledByOurs) {
                throw new Error('pen merge: merged nodes form a cycle');
            }

            return breakCycles(ctx);
        }

        for (const node of path) {
            settled.add(node);
        }
    }
}

function buildDocument(ctx: MergeContext): PenDocument {
    const built = { count: 0 };
    const merged = mergeRecord(ctx.base.doc, ctx.ours.doc, ctx.theirs.doc, (key, base, ours, theirs) => {
        switch (key) {
            case 'children':
                return buildChildren(ctx, null, built);
            case 'variables':
                return mergeObject(base, ours, theirs, (name, baseVariable, oursVariable, theirsVariable) =>
                    mergeAtomic(ctx, {
                        conflict: { kind: 'top-level', node: null, key: `variables.${name}` },
                        values: [baseVariable, oursVariable, theirsVariable],
                    }),
                );
            default:
                return mergeAtomic(ctx, {
                    conflict: { kind: 'top-level', node: null, key },
                    values: [base, ours, theirs],
                });
        }
    });

    // Every planned node hangs under a planned parent, so the build reaches them all; this guards it.
    if (built.count !== ctx.plans.size) {
        throw new Error('pen merge: a merged node lost its parent');
    }

    const doc = Object.fromEntries(merged);
    if (!isPenDocument(doc)) {
        throw new TypeError('pen merge: the merged document has no `version` or `children`');
    }

    return doc;
}

function buildChildren(ctx: MergeContext, parentId: string | null, built: { count: number }): PenNode[] {
    const oursChildren = getChildIds(ctx.ours, parentId);
    const theirsChildren = getChildIds(ctx.theirs, parentId);

    const ids = mergeSequence({
        ours: oursChildren,
        theirs: theirsChildren,
        placedBy: id => {
            const plan = ctx.plans.get(id);
            return plan && getPlannedParent(ctx, id) === parentId ? plan.placement : null;
        },
    });

    return ids.map(id => buildNode(ctx, id, built));
}

function buildNode(ctx: MergeContext, id: string, built: { count: number }): PenNode {
    built.count++;
    const children = buildChildren(ctx, id, built);
    const node: Record<string, unknown> = {};

    for (const [key, value] of getProps(ctx, id)) {
        node[key] = key === 'children' ? children : value;
    }

    if (children.length > 0 && node.children === undefined) {
        node.children = children;
    }

    if (!isPenNode(node)) {
        throw new TypeError(`pen merge: the merged node ${id} has no \`id\` or \`type\``);
    }

    return node;
}

/** A node's merged own properties, with `children` (when the node keeps the key) as a placeholder. */
function mergeNodeProps(ctx: MergeContext, id: string): Map<string, unknown> {
    const plan = ctx.plans.get(id);
    assert(plan);

    if (plan.source !== 'merge') {
        return new Map(Object.entries(getEntry(ctx[plan.source].index, id).node));
    }

    const node = conflictNode(ctx, id);
    return mergeRecord(
        getEntry(ctx.base.index, id).node,
        getEntry(ctx.ours.index, id).node,
        getEntry(ctx.theirs.index, id).node,
        (key, base, ours, theirs) => {
            switch (key) {
                case 'children':
                    return mergePresence(base, ours, theirs) ? true : undefined;
                case 'descendants':
                    return mergeObject(base, ours, theirs, (path, baseEntry, oursEntry, theirsEntry) =>
                        mergeOverride(ctx, { node, path, values: [baseEntry, oursEntry, theirsEntry] }),
                    );
                default:
                    return mergeAtomic(ctx, {
                        conflict: { kind: 'property', node, key },
                        values: [base, ours, theirs],
                    });
            }
        },
    );
}

/** Options of {@link mergeOverride}. */
interface MergeOverrideOptions {
    node: PenConflictNode;
    /** The id path keying the entry in `descendants`. */
    path: string;
    values: [unknown, unknown, unknown];
}

/** A replacement (an entry with its own `type`) is one value; property overrides merge per property. */
function mergeOverride(ctx: MergeContext, options: MergeOverrideOptions): unknown {
    const { node, path, values } = options;
    const key = `descendants[${JSON.stringify(path)}]`;

    if (values.some(value => isPlainObject(value) && value.type !== undefined)) {
        return mergeAtomic(ctx, { conflict: { kind: 'override', node, key }, values });
    }

    const [base, ours, theirs] = values;
    return mergeObject(base, ours, theirs, (property, baseValue, oursValue, theirsValue) =>
        mergeAtomic(ctx, {
            conflict: { kind: 'override', node, key: `${key}.${property}` },
            values: [baseValue, oursValue, theirsValue],
        }),
    );
}

/** Options of {@link mergeAtomic}. */
interface MergeAtomicOptions {
    /** The conflict to report, short of its values. */
    conflict: Omit<PenValueConflict, 'base' | 'ours' | 'theirs'>;
    /** Base, ours and theirs; `undefined` for an absent one. */
    values: [unknown, unknown, unknown];
}

/** The side that changed the value wins; both changing it differently keeps ours and records a conflict. */
function mergeAtomic(ctx: MergeContext, options: MergeAtomicOptions): unknown {
    const [base, ours, theirs] = options.values;
    if (deepEquals(ours, theirs) || deepEquals(base, theirs)) {
        return ours;
    }

    if (deepEquals(base, ours)) {
        return theirs;
    }

    ctx.conflicts.push({ ...options.conflict, base, ours, theirs });
    return ours;
}

/**
 * Merges a JSON object per key. The object is absent from the result only when it is absent on the
 * side that changed its presence and no key survives the merge.
 */
function mergeObject(base: unknown, ours: unknown, theirs: unknown, mergeValue: MergeValue): unknown {
    const merged = mergeRecord(asRecord(base), asRecord(ours), asRecord(theirs), mergeValue);
    if (merged.size === 0 && !mergePresence(base, ours, theirs)) {
        return undefined;
    }

    return Object.fromEntries(merged);
}

/**
 * Merges objects per key, `undefined` standing for an absent object or key. Keys come in ours'
 * order, with the keys theirs added or moved placed after the key they follow in theirs.
 */
function mergeRecord(
    base: Record<string, unknown> | undefined,
    ours: Record<string, unknown> | undefined,
    theirs: Record<string, unknown> | undefined,
    mergeValue: MergeValue,
): Map<string, unknown> {
    const baseKeys = Object.keys(base ?? {});
    const oursKeys = Object.keys(ours ?? {});
    const theirsKeys = Object.keys(theirs ?? {});
    const values = new Map<string, unknown>();

    for (const key of new Set([...oursKeys, ...theirsKeys, ...baseKeys])) {
        const value = mergeValue(key, base?.[key], ours?.[key], theirs?.[key]);
        if (value !== undefined) {
            values.set(key, value);
        }
    }

    const oursKeySet = new Set(oursKeys);
    const movedByOurs = findMovedItems(baseKeys, oursKeys);
    const movedByTheirs = findMovedItems(baseKeys, theirsKeys);
    const order = mergeSequence({
        ours: oursKeys,
        theirs: theirsKeys,
        placedBy: key => {
            if (!values.has(key)) {
                return null;
            }

            const theirsPlaced = !oursKeySet.has(key) || (movedByTheirs.has(key) && !movedByOurs.has(key));
            return theirsPlaced ? 'theirs' : 'ours';
        },
    });

    return new Map(order.map(key => [key, values.get(key)]));
}

/** Options of {@link mergeSequence}. */
interface MergeSequenceOptions {
    ours: string[];
    theirs: string[];
    /** The side whose position an item takes, or null when the item is not in the result. */
    placedBy: (item: string) => PenMergeSide | null;
}

/**
 * Ours' items placed by ours, in ours' order; then each item placed by theirs, after its nearest
 * preceding item in theirs that is already in the result, or first.
 */
function mergeSequence(options: MergeSequenceOptions): string[] {
    const { ours, theirs, placedBy } = options;
    const result = ours.filter(item => placedBy(item) === 'ours');

    for (const [position, item] of theirs.entries()) {
        if (placedBy(item) !== 'theirs') {
            continue;
        }

        let at = 0;
        for (let previous = position - 1; previous >= 0; previous--) {
            const found = result.indexOf(theirs[previous] ?? '');
            if (found >= 0) {
                at = found + 1;
                break;
            }
        }

        result.splice(at, 0, item);
    }

    return result;
}

/** Whether `side` moved the node: to another parent, or among its siblings. */
function isMoved(ctx: MergeContext, side: PenMergeSide, id: string): boolean {
    const baseParent = getEntry(ctx.base.index, id).parentId;
    if (getEntry(ctx[side].index, id).parentId !== baseParent) {
        return true;
    }

    let moved = ctx.movedWithin[side].get(baseParent);
    if (!moved) {
        moved = findMovedItems(getChildIds(ctx.base, baseParent), getChildIds(ctx[side], baseParent));
        ctx.movedWithin[side].set(baseParent, moved);
    }

    return moved.has(id);
}

/** Whether both sides put the node under the same parent after the same sibling. */
function isSamePlace(ctx: MergeContext, id: string): boolean {
    const ours = getEntry(ctx.ours.index, id);
    const theirs = getEntry(ctx.theirs.index, id);

    return (
        ours.parentId === theirs.parentId &&
        getChildIds(ctx.ours, ours.parentId)[ours.index - 1] ===
            getChildIds(ctx.theirs, theirs.parentId)[theirs.index - 1]
    );
}

function pushMoveConflict(ctx: MergeContext, id: string) {
    const [base, ours, theirs] = [ctx.base, ctx.ours, ctx.theirs].map(input => {
        const entry = getEntry(input.index, id);
        return { parent: entry.parentId, index: entry.index };
    });

    ctx.conflicts.push({ kind: 'move', node: conflictNode(ctx, id), key: null, base, ours, theirs });
}

/**
 * The nodes of `side` that differ from `base` in themselves or in their subtree: added, with other
 * own properties, another parent, or other child ids.
 */
function findTouched(base: Map<string, PenIndexEntry>, side: Map<string, PenIndexEntry>): Set<string> {
    const touched = new Set<string>();

    // The index lists a node before its subtree, so in reverse every subtree comes before its root.
    for (const entry of [...side.values()].toReversed()) {
        const id = entry.node.id;
        const baseEntry = base.get(id);

        if (
            !baseEntry ||
            baseEntry.parentId !== entry.parentId ||
            !ownPropsEqual(baseEntry.node, entry.node) ||
            !deepEquals(getNodeChildIds(baseEntry.node), getNodeChildIds(entry.node))
        ) {
            touched.add(id);
        }

        if (touched.has(id) && entry.parentId !== null) {
            touched.add(entry.parentId);
        }
    }

    return touched;
}

/**
 * Adds the ids instances refer to in a node's `ref`, its `descendants` and their `children`
 * (pass a canvas node without its `children`: those are canvas nodes of their own).
 */
function collectRefs(node: Record<string, unknown>, refs: Set<string>) {
    if (typeof node.ref === 'string') {
        refs.add(node.ref);
    }

    const overrides = isPlainObject(node.descendants) ? Object.values(node.descendants) : [];
    const children: unknown[] = Array.isArray(node.children) ? node.children : [];
    for (const value of [...overrides, ...children]) {
        if (isPlainObject(value)) {
            collectRefs(value, refs);
        }
    }
}

function ownPropsEqual(a: PenNode, b: PenNode): boolean {
    const aKeys = Object.keys(a).filter(key => key !== 'children');
    const bKeys = Object.keys(b).filter(key => key !== 'children');

    return aKeys.length === bKeys.length && aKeys.every(key => key in b && deepEquals(a[key], b[key]));
}

/** Whether the value is present in the result, by its presence on each side; `undefined` is absent. */
function mergePresence(base: unknown, ours: unknown, theirs: unknown): boolean {
    const inOurs = ours !== undefined;
    const inTheirs = theirs !== undefined;
    const oursChanged = (base !== undefined) !== inOurs;

    return inOurs === inTheirs || oursChanged ? inOurs : inTheirs;
}

function conflictNode(ctx: MergeContext, id: string): PenConflictNode {
    const entry = ctx.ours.index.get(id) ?? ctx.theirs.index.get(id) ?? ctx.base.index.get(id);
    assert(entry);

    return { id, name: typeof entry.node.name === 'string' ? entry.node.name : null, frame: entry.frame };
}

function getPlannedParent(ctx: MergeContext, id: string): string | null {
    const plan = ctx.plans.get(id);
    assert(plan);
    return getEntry(ctx[plan.placement].index, id).parentId;
}

function getChildIds(input: MergeInput, parentId: string | null): string[] {
    if (parentId === null) {
        return input.doc.children.map(child => child.id);
    }

    const entry = input.index.get(parentId);
    return entry ? getNodeChildIds(entry.node) : [];
}

function getNodeChildIds(node: PenNode): string[] {
    return (node.children ?? []).map(child => child.id);
}

function getEntry(index: Map<string, PenIndexEntry>, id: string): PenIndexEntry {
    const entry = index.get(id);
    assert(entry, `pen merge: no node ${id}`);
    return entry;
}

function getProps(ctx: MergeContext, id: string): Map<string, unknown> {
    const props = ctx.props.get(id);
    assert(props);
    return props;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return isPlainObject(value) ? value : undefined;
}

function otherSide(side: PenMergeSide): PenMergeSide {
    return side === 'ours' ? 'theirs' : 'ours';
}

function isPenNode(value: Record<string, unknown>): value is PenNode {
    return typeof value.id === 'string' && typeof value.type === 'string';
}

function isPenDocument(value: Record<string, unknown>): value is PenDocument {
    return typeof value.version === 'string' && Array.isArray(value.children);
}
