import type { PenDocument, PenIndexEntry, PenNode } from './PenDocument.js';
import { indexPen, isPenReplacement, parsePen, walkPen } from './PenDocument.js';

/** Format versions the tooling was written against; another one is reported as a warning. */
const KNOWN_VERSIONS = new Set(['2.22']);

/**
 * Properties holding free text a person typed, where a leading `$` is text ("$5 off"), not a
 * variable reference. `content` can bind a variable too, but text starting with `$` is far more
 * likely there, so it is never checked.
 */
const FREE_TEXT_KEYS = new Set(['content', 'name', 'context', 'metadata']);

/** Matches a line git writes to mark a conflict. JSON a `.pen` holds never starts a line with one. */
const CONFLICT_MARKER = /^(<{7}|={7}|>{7})(\s|$)/;

/** Something wrong with a `.pen` file. */
export interface PenProblem {
    /** An error makes the file unusable or broken in Pen; a warning only asks for a look. */
    severity: 'error' | 'warning';
    /** The node the problem is on, or null for one about the whole file or its variables. */
    nodeId: string | null;
    message: string;
}

/**
 * Checks the text of a `.pen` file for what breaks it in Pen or betrays a bad merge: conflict
 * markers, invalid JSON or shape, duplicate ids or ids containing `/`, instances of missing or
 * non-reusable nodes, and references to undefined variables. An unknown format version is a warning.
 * @__NO_SIDE_EFFECTS__
 */
export function checkPen(text: string): PenProblem[] {
    const markers = findConflictMarkers(text);
    if (markers.length > 0) {
        return markers;
    }

    let doc: PenDocument;
    try {
        doc = parsePen(text);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return [{ severity: 'error', nodeId: null, message: `not a valid Pen document: ${reason}` }];
    }

    const problems: PenProblem[] = [];
    if (!KNOWN_VERSIONS.has(doc.version)) {
        problems.push({
            severity: 'warning',
            nodeId: null,
            message: `unknown format version ${doc.version} (known: ${[...KNOWN_VERSIONS].join(', ')})`,
        });
    }

    const index = indexPen(doc);
    const variables = new Set(Object.keys(doc.variables ?? {}));
    const seenIds = new Set<string>();

    for (const { node } of walkPen(doc)) {
        const messages = checkNode({ node, index, variables, duplicate: seenIds.has(node.id) });
        seenIds.add(node.id);

        for (const message of messages) {
            problems.push({ severity: 'error', nodeId: node.id, message });
        }
    }

    for (const [name, variable] of Object.entries(doc.variables ?? {})) {
        for (const reference of findReferences(variable, '')) {
            if (!variables.has(reference.value.slice(1))) {
                problems.push({
                    severity: 'error',
                    nodeId: null,
                    message: `variable "${name}" refers to undefined variable ${reference.value}`,
                });
            }
        }
    }

    return problems;
}

/** A `$name` string found in a property value. */
interface VariableReference {
    /** Where the string sits, e.g. `stroke.fill` or `descendants["a/b"].fill`. */
    path: string;
    value: string;
}

/** Options of {@link checkNode}. */
interface CheckNodeOptions {
    node: PenNode;
    /** The canvas, where instances find what they reuse. */
    index: Map<string, PenIndexEntry>;
    /** Names of the document's variables. */
    variables: Set<string>;
    /** Whether a node visited earlier has the same id. */
    duplicate: boolean;
}

/** The errors on one node, as messages. */
function checkNode(options: CheckNodeOptions): string[] {
    const { node, index, variables, duplicate } = options;
    const messages: string[] = [];

    if (duplicate) {
        messages.push('duplicate id: another node already uses it');
    }

    if (node.id.includes('/')) {
        messages.push('id contains "/", which joins ids into override paths');
    }

    if (node.type === 'ref') {
        const target = typeof node.ref === 'string' ? index.get(node.ref) : undefined;
        if (typeof node.ref !== 'string') {
            messages.push('instance has no string `ref`');
        } else if (!target) {
            messages.push(`instance of missing node "${node.ref}"`);
        } else if (target.node.reusable !== true) {
            messages.push(`instance of node "${node.ref}", which is not a component (no \`reusable: true\`)`);
        }
    }

    for (const reference of findUndefinedVariables(node, variables)) {
        messages.push(`${reference.path} refers to undefined variable ${reference.value}`);
    }

    return messages;
}

function findConflictMarkers(text: string): PenProblem[] {
    const problems: PenProblem[] = [];
    for (const [lineIndex, line] of text.split('\n').entries()) {
        if (CONFLICT_MARKER.test(line)) {
            problems.push({
                severity: 'error',
                nodeId: null,
                message: `line ${lineIndex + 1}: merge conflict marker ${line.slice(0, 7)}`,
            });
        }
    }

    return problems;
}

/**
 * The variable references in a node's own properties and in its property overrides that name no
 * variable. Children and override subtrees are nodes of their own, visited by the walk.
 */
function findUndefinedVariables(node: PenNode, variables: Set<string>): VariableReference[] {
    const references: VariableReference[] = [];

    for (const [key, value] of Object.entries(node)) {
        if (key === 'children' || key === 'descendants' || FREE_TEXT_KEYS.has(key)) {
            continue;
        }
        references.push(...findReferences(value, key));
    }

    for (const [path, override] of Object.entries(node.descendants ?? {})) {
        if (isPenReplacement(override)) {
            continue;
        }

        for (const [key, value] of Object.entries(override)) {
            if (key === 'children' || FREE_TEXT_KEYS.has(key)) {
                continue;
            }
            references.push(...findReferences(value, `descendants[${JSON.stringify(path)}].${key}`));
        }
    }

    return references.filter(reference => !variables.has(reference.value.slice(1)));
}

function findReferences(value: unknown, path: string): VariableReference[] {
    if (typeof value === 'string') {
        return value.startsWith('$') ? [{ path, value }] : [];
    }

    const references: VariableReference[] = [];
    if (Array.isArray(value)) {
        for (const [position, item] of value.entries()) {
            references.push(...findReferences(item, `${path}[${position}]`));
        }
    } else if (value !== null && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
            references.push(...findReferences(item, path ? `${path}.${key}` : key));
        }
    }

    return references;
}
