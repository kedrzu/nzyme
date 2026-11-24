import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

/**
 * A parsed `.pen` file. Every key read is kept, in its order, so {@link serializePen} writes back
 * exactly what {@link parsePen} read; only the keys the tooling relies on are typed.
 */
export interface PenDocument {
    /** Format version, e.g. `"2.22"`. */
    version: string;
    /** Top-level canvas nodes, usually frames (screens, component sheets). */
    children: PenNode[];
    /** Design tokens by name; a property binds one with a `"$name"` string. */
    variables?: Record<string, unknown>;
    [key: string]: unknown;
}

/** A node on the canvas or inside an instance's override subtree. */
export interface PenNode {
    /** Unique across the document; never contains `/`, which joins ids into override paths. */
    id: string;
    /** `frame`, `group`, `text`, `ref` (an instance of a reusable node), … */
    type: string;
    children?: PenNode[];
    /** On an instance (`type: "ref"`): overrides keyed by the id path of the descendant they change. */
    descendants?: Record<string, PenOverride>;
    [key: string]: unknown;
}

/**
 * An entry of an instance's `descendants`: a replacement (a whole node tree, recognised by its own
 * `type`, see {@link isPenReplacement}) or property overrides applied to the descendant.
 */
export type PenOverride = PenNode | PenPropertyOverride;

/** Properties set on a descendant of an instance. `children`, when present, replaces its children. */
export interface PenPropertyOverride {
    children?: PenNode[];
    [key: string]: unknown;
}

/** Where a node sits on the canvas, as recorded by {@link indexPen}. */
export interface PenIndexEntry {
    node: PenNode;
    /** The node whose `children` hold it, or null for a top-level node. */
    parentId: string | null;
    /** Position among its parent's children (or among the top-level nodes). */
    index: number;
    /** The top-level node it belongs to (itself for a top-level node), for naming a place to a reader. */
    frame: PenFrameRef;
}

/** A top-level node, by id and name. */
export interface PenFrameRef {
    id: string;
    name: string | null;
}

/** A node visited by {@link walkPen}. */
export interface PenWalkEntry {
    node: PenNode;
    /** The node whose `children` hold it; null for a top-level node or the root of an override subtree. */
    parent: PenNode | null;
    /** Set when the node lives in an instance's `descendants` rather than on the canvas. */
    override: PenWalkOverride | null;
}

/** The `descendants` entry a node visited by {@link walkPen} comes from. */
export interface PenWalkOverride {
    /** The instance (`type: "ref"`) whose `descendants` hold the subtree. */
    instance: PenNode;
    /** The id path keying the entry in `descendants`. */
    path: string;
}

/**
 * Parses the text of a `.pen` file, checking the shape the tooling relies on: a `version`, and
 * nodes with a string `id` and `type` throughout `children` and `descendants`.
 * Throws a `SyntaxError` on invalid JSON and a `TypeError` naming the offending JSON path otherwise.
 * @__NO_SIDE_EFFECTS__
 */
export function parsePen(text: string): PenDocument {
    const value: unknown = JSON.parse(text);
    assertPenDocument(value);
    return value;
}

/**
 * Writes a document the way Pen does (two-space JSON), so an unchanged document gives back its
 * input byte for byte. The text ends like `likeText` — the file it was read from — does: Pen writes
 * no trailing newline, but a file an editor gave one keeps it.
 * @__NO_SIDE_EFFECTS__
 */
export function serializePen(doc: PenDocument, likeText?: string): string {
    const json = JSON.stringify(doc, null, 2);
    if (likeText === undefined) {
        return json;
    }

    return json + likeText.slice(likeText.trimEnd().length);
}

/**
 * Maps every canvas node id to where it sits. Nodes inside `descendants` are not on the canvas and
 * are left out (see {@link walkPen}). Ids are expected to be unique (`checkPen` reports duplicates);
 * on a duplicate, the first node in document order wins.
 * @__NO_SIDE_EFFECTS__
 */
export function indexPen(doc: PenDocument): Map<string, PenIndexEntry> {
    const index = new Map<string, PenIndexEntry>();

    for (const [position, topLevel] of doc.children.entries()) {
        const frame: PenFrameRef = {
            id: topLevel.id,
            name: typeof topLevel.name === 'string' ? topLevel.name : null,
        };

        addToIndex({ index, node: topLevel, parentId: null, position, frame });
    }

    return index;
}

/**
 * Visits every node in document order: canvas nodes, and the nodes of override subtrees — a
 * replacement in an instance's `descendants`, or the `children` a property override sets — flagged
 * with the entry they come from. A node is visited before its override subtrees and its children.
 */
export function* walkPen(doc: PenDocument): Generator<PenWalkEntry> {
    yield* walkNodes(doc.children, null, null);
}

/**
 * Whether a `descendants` entry replaces the descendant with a whole node tree, rather than setting
 * some of its properties. A replacement is recognised by having its own `type`.
 * @__NO_SIDE_EFFECTS__
 */
export function isPenReplacement(override: PenOverride): override is PenNode {
    return typeof override.type === 'string';
}

/** Options of {@link addToIndex}. */
interface AddToIndexOptions {
    index: Map<string, PenIndexEntry>;
    node: PenNode;
    parentId: string | null;
    position: number;
    frame: PenFrameRef;
}

function addToIndex(options: AddToIndexOptions) {
    const { index, node, parentId, position, frame } = options;
    if (!index.has(node.id)) {
        index.set(node.id, { node, parentId, index: position, frame });
    }

    for (const [childPosition, child] of (node.children ?? []).entries()) {
        addToIndex({ index, node: child, parentId: node.id, position: childPosition, frame });
    }
}

function* walkNodes(
    nodes: PenNode[],
    parent: PenNode | null,
    override: PenWalkOverride | null,
): Generator<PenWalkEntry> {
    for (const node of nodes) {
        yield { node, parent, override };

        for (const [path, entry] of Object.entries(node.descendants ?? {})) {
            const subtree = isPenReplacement(entry) ? [entry] : (entry.children ?? []);
            yield* walkNodes(subtree, null, { instance: node, path });
        }

        yield* walkNodes(node.children ?? [], node, override);
    }
}

function assertPenDocument(value: unknown): asserts value is PenDocument {
    if (!isPlainObject(value)) {
        throw new TypeError('Not a Pen document: the top level is not an object');
    }

    if (typeof value.version !== 'string') {
        throw new TypeError('Not a Pen document: `version` is not a string');
    }

    if (value.variables !== undefined && !isPlainObject(value.variables)) {
        throw new TypeError('Not a Pen document: `variables` is not an object');
    }

    assertPenNodes(value.children, 'children');
}

function assertPenNodes(value: unknown, path: string): asserts value is PenNode[] {
    if (!Array.isArray(value)) {
        throw new TypeError(`Not a Pen document: \`${path}\` is not an array`);
    }

    for (const [position, node] of value.entries()) {
        assertPenNode(node, `${path}[${position}]`);
    }
}

function assertPenNode(value: unknown, path: string): asserts value is PenNode {
    if (!isPlainObject(value)) {
        throw new TypeError(`Not a Pen document: \`${path}\` is not an object`);
    }

    if (typeof value.id !== 'string') {
        throw new TypeError(`Not a Pen document: \`${path}\` has no string \`id\``);
    }

    if (typeof value.type !== 'string') {
        throw new TypeError(`Not a Pen document: \`${path}\` (${value.id}) has no string \`type\``);
    }

    if (value.children !== undefined) {
        assertPenNodes(value.children, `${path}.children`);
    }

    if (value.descendants !== undefined) {
        assertDescendants(value.descendants, `${path}.descendants`);
    }
}

function assertDescendants(value: unknown, path: string): asserts value is Record<string, PenOverride> {
    if (!isPlainObject(value)) {
        throw new TypeError(`Not a Pen document: \`${path}\` is not an object`);
    }

    for (const [key, entry] of Object.entries(value)) {
        const entryPath = `${path}[${JSON.stringify(key)}]`;
        if (!isPlainObject(entry)) {
            throw new TypeError(`Not a Pen document: \`${entryPath}\` is not an object`);
        }

        if (entry.type !== undefined) {
            assertPenNode(entry, entryPath);
        } else if (entry.children !== undefined) {
            assertPenNodes(entry.children, `${entryPath}.children`);
        }
    }
}
