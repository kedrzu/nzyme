import { deepEquals } from '@nzyme/utils/deepEquals.js';

import { findMovedItems } from './findMovedItems.js';
import type { PenDocument, PenFrameRef, PenIndexEntry, PenNode, PenOverride } from './PenDocument.js';
import { indexPen, isPenReplacement, walkPen } from './PenDocument.js';

/** What changed between two versions of a `.pen` document. */
export interface PenDiff {
    /** Node changes per top-level frame, in document order (frames only `before` has come last). */
    frames: PenFrameDiff[];
    variables: PenVariableChange[];
    /**
     * Reusable nodes that were added, removed, or changed themselves or in their subtree: a component
     * change reaches every screen using it, so it is called out apart from its frame.
     */
    components: PenComponentChange[];
    /** Document keys other than `children` and `variables` whose value changed, e.g. `version`. */
    keys: string[];
}

/** The node changes inside one top-level frame. */
export interface PenFrameDiff {
    /** As `after` has it; as `before` has it for a removed frame. */
    frame: PenFrameRef;
    added: PenSubtreeNode[];
    /** Grouped by the frame they sat in before. */
    removed: PenSubtreeNode[];
    changed: PenChangedNode[];
    moved: PenMovedNode[];
}

/** A canvas node named for a reader. */
export interface PenDiffNode {
    id: string;
    name: string | null;
    type: string;
}

/**
 * The topmost node of an added (removed) subtree: the nodes added (removed) inside it are counted,
 * not listed.
 */
export interface PenSubtreeNode extends PenDiffNode {
    /** Nodes added (removed) with it, at any depth below it. */
    descendants: number;
}

/** A node whose own properties changed. */
export interface PenChangedNode extends PenDiffNode {
    /**
     * The changed properties, `children` aside (child changes are nodes of their own). An
     * instance's overrides are listed per property: `descendants["a/b"].fill`, or
     * `descendants["a/b"]` for a replacement subtree.
     */
    keys: string[];
}

/** A node that changed parent, or its order among the siblings it kept. */
export interface PenMovedNode extends PenDiffNode {
    from: PenNodePlace;
    to: PenNodePlace;
}

/** Where a node sits: its parent (null at the top level) and its position among the parent's children. */
export interface PenNodePlace {
    parentId: string | null;
    index: number;
}

/** A design token (entry of `variables`) that was added, removed or given another value. */
export interface PenVariableChange {
    name: string;
    change: 'added' | 'removed' | 'changed';
    /** `undefined` when added. */
    before: unknown;
    /** `undefined` when removed. */
    after: unknown;
}

/** A component (a node with `reusable: true`) that changed. */
export interface PenComponentChange extends PenDiffNode {
    frame: PenFrameRef;
    change: 'added' | 'removed' | 'changed';
    /** Instances (`type: "ref"`) of it in `after`, override subtrees included. */
    instances: number;
}

/**
 * Compares two versions of a document node by node: added, removed, changed and moved canvas
 * nodes grouped by top-level frame, changed variables, and changed components with their usage.
 * @__NO_SIDE_EFFECTS__
 */
export function diffPen(before: PenDocument, after: PenDocument): PenDiff {
    const beforeIndex = indexPen(before);
    const afterIndex = indexPen(after);
    const frames = new Map<string, PenFrameDiff>();
    const touched = new Map<string, 'before' | 'after'>();
    const movedWithin = new Map<string | null, Set<string>>();
    /** Each added or removed node's topmost added (removed) ancestor, itself included. */
    const subtrees = new Map<string, PenSubtreeNode>();

    for (const [id, entry] of afterIndex) {
        const old = beforeIndex.get(id);
        if (!old) {
            addToSubtree(entry, getFrameDiff(entry.frame).added);
            touched.set(id, 'after');
            continue;
        }

        const keys = diffNodeKeys(old.node, entry.node);
        if (keys.length > 0) {
            getFrameDiff(entry.frame).changed.push({ ...describeNode(entry.node), keys });
            touched.set(id, 'after');
        }

        if (isMoved(old, entry)) {
            getFrameDiff(entry.frame).moved.push({
                ...describeNode(entry.node),
                from: { parentId: old.parentId, index: old.index },
                to: { parentId: entry.parentId, index: entry.index },
            });
            touched.set(id, 'after');
        }
    }

    for (const [id, entry] of beforeIndex) {
        if (!afterIndex.has(id)) {
            addToSubtree(entry, getFrameDiff(entry.frame).removed);
            touched.set(id, 'before');
        }
    }

    return {
        frames: [...frames.values()],
        variables: diffVariables(before.variables ?? {}, after.variables ?? {}),
        components: findChangedComponents(),
        keys: diffDocumentKeys(before, after),
    };

    function getFrameDiff(frame: PenFrameRef): PenFrameDiff {
        let diff = frames.get(frame.id);
        if (!diff) {
            diff = { frame, added: [], removed: [], changed: [], moved: [] };
            frames.set(frame.id, diff);
        }

        return diff;
    }

    /** Lists the node unless its parent is added (removed) too; the index has parents first. */
    function addToSubtree(entry: PenIndexEntry, list: PenSubtreeNode[]) {
        let subtree = entry.parentId === null ? undefined : subtrees.get(entry.parentId);
        if (subtree) {
            subtree.descendants++;
        } else {
            subtree = { ...describeNode(entry.node), descendants: 0 };
            list.push(subtree);
        }

        subtrees.set(entry.node.id, subtree);
    }

    function isMoved(old: PenIndexEntry, entry: PenIndexEntry): boolean {
        if (old.parentId !== entry.parentId) {
            return true;
        }

        const parentId = entry.parentId;
        let moved = movedWithin.get(parentId);
        if (!moved) {
            moved = findMovedItems(
                getChildIds(before, beforeIndex, parentId),
                getChildIds(after, afterIndex, parentId),
            );
            movedWithin.set(parentId, moved);
        }

        return moved.has(entry.node.id);
    }

    /** Every reusable node that is touched or holds a touched node, with how it changed. */
    function findChangedComponents(): PenComponentChange[] {
        const changed = new Map<string, PenComponentChange>();
        const instances = countInstances(after);

        for (const [id, side] of touched) {
            const index = side === 'after' ? afterIndex : beforeIndex;
            for (
                let entry = index.get(id);
                entry;
                entry = entry.parentId === null ? undefined : index.get(entry.parentId)
            ) {
                if (entry.node.reusable !== true || changed.has(entry.node.id)) {
                    continue;
                }

                const componentId = entry.node.id;
                const inBefore = beforeIndex.has(componentId);
                const current = afterIndex.get(componentId) ?? entry;
                changed.set(componentId, {
                    ...describeNode(current.node),
                    frame: current.frame,
                    change: !afterIndex.has(componentId) ? 'removed' : inBefore ? 'changed' : 'added',
                    instances: instances.get(componentId) ?? 0,
                });
            }
        }

        return [...changed.values()];
    }
}

function describeNode(node: PenNode): PenDiffNode {
    return { id: node.id, name: typeof node.name === 'string' ? node.name : null, type: node.type };
}

/** The node's own keys whose value differs; `descendants` per override property. */
function diffNodeKeys(before: PenNode, after: PenNode): string[] {
    const keys: string[] = [];

    for (const key of unionKeys(before, after)) {
        if (key === 'children' || deepEquals(before[key], after[key])) {
            continue;
        }

        if (key === 'descendants') {
            keys.push(...diffOverrides(before.descendants ?? {}, after.descendants ?? {}));
        } else {
            keys.push(key);
        }
    }

    return keys;
}

function diffOverrides(before: Record<string, PenOverride>, after: Record<string, PenOverride>): string[] {
    const keys: string[] = [];

    for (const path of unionKeys(before, after)) {
        const old = before[path];
        const current = after[path];
        if (deepEquals(old, current)) {
            continue;
        }

        const key = `descendants[${JSON.stringify(path)}]`;
        if ((old && isPenReplacement(old)) || (current && isPenReplacement(current))) {
            keys.push(key);
            continue;
        }

        const oldProps = old ?? {};
        const currentProps = current ?? {};
        for (const property of unionKeys(oldProps, currentProps)) {
            if (!deepEquals(oldProps[property], currentProps[property])) {
                keys.push(`${key}.${property}`);
            }
        }
    }

    return keys;
}

function diffVariables(before: Record<string, unknown>, after: Record<string, unknown>): PenVariableChange[] {
    const changes: PenVariableChange[] = [];

    for (const name of unionKeys(before, after)) {
        const old = before[name];
        const current = after[name];
        if (deepEquals(old, current)) {
            continue;
        }

        const change = old === undefined ? 'added' : current === undefined ? 'removed' : 'changed';
        changes.push({ name, change, before: old, after: current });
    }

    return changes;
}

function diffDocumentKeys(before: PenDocument, after: PenDocument): string[] {
    return unionKeys(before, after).filter(
        key => key !== 'children' && key !== 'variables' && !deepEquals(before[key], after[key]),
    );
}

/** Instances per referenced id, counting those inside override subtrees too. */
function countInstances(doc: PenDocument): Map<string, number> {
    const counts = new Map<string, number>();
    for (const { node } of walkPen(doc)) {
        if (node.type === 'ref' && typeof node.ref === 'string') {
            counts.set(node.ref, (counts.get(node.ref) ?? 0) + 1);
        }
    }

    return counts;
}

function getChildIds(doc: PenDocument, index: Map<string, PenIndexEntry>, parentId: string | null): string[] {
    const children = parentId === null ? doc.children : (index.get(parentId)?.node.children ?? []);
    return children.map(child => child.id);
}

/** The keys of both objects, `a`'s order first. */
function unionKeys(a: object, b: object): string[] {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])];
}
