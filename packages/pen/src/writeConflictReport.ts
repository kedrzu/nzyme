import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assertNever } from '@nzyme/utils/assertNever.js';
import { capitalizeFirstLetter } from '@nzyme/utils/string/caseUtils.js';

import { formatPenValue } from './formatPenValue.js';
import type { PenConflict, PenConflictNode } from './mergePen.js';

/** Options of {@link writeConflictReport}. */
export interface WriteConflictReportOptions {
    /** Where the report goes; outside the working tree, so `git add -A` can't commit it. */
    reportPath: string;
    /** The merged file, as the repo names it. */
    file: string;
    conflicts: PenConflict[];
}

/**
 * Writes the Markdown report of a `.pen` merge's conflicts for whoever resolves them, usually an
 * agent: what was kept, and per conflict the node, its screen and the three values. With no
 * conflicts, removes the report a previous merge of the file left.
 */
export async function writeConflictReport(options: WriteConflictReportOptions): Promise<void> {
    const { reportPath, file, conflicts } = options;
    if (conflicts.length === 0) {
        await rm(reportPath, { force: true });
        return;
    }

    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, formatReport(file, conflicts));
}

function formatReport(file: string, conflicts: PenConflict[]): string {
    const nodes = new Map<string, PenConflictNode>();
    for (const conflict of conflicts) {
        if (conflict.node) {
            nodes.set(conflict.node.id, conflict.node);
        }
    }

    const lines = [
        `# Pen merge conflicts in \`${file}\``,
        '',
        `\`${file}\` was merged node by node, with ${conflicts.length} conflict(s). The file is valid JSON without`,
        'conflict markers. At each conflict it holds **ours** (the checked-out branch), or the side that edited a node',
        'the other deleted. Theirs is the branch being merged in. Bring in what the other side meant where it should',
        `win, then \`git add ${file}\`.`,
        '',
    ];

    if (nodes.size > 0) {
        lines.push('Conflicting nodes:', '');
        for (const node of nodes.values()) {
            lines.push(`- ${formatNode(node)}`);
        }
        lines.push('');
    }

    for (const [position, conflict] of conflicts.entries()) {
        lines.push(`## ${position + 1}. ${conflict.kind}`, '', ...formatConflict(conflict), '');
    }

    return lines.join('\n');
}

function formatConflict(conflict: PenConflict): string[] {
    const where = conflict.node ? [`- Node: ${formatNode(conflict.node)}`] : [];

    switch (conflict.kind) {
        case 'delete-edit': {
            const editedBy = conflict.deletedBy === 'ours' ? 'theirs' : 'ours';
            return [
                ...where,
                `- ${capitalizeFirstLetter(conflict.deletedBy)} deleted the node or an ancestor; ${editedBy} edited it or its subtree.`,
                `  Kept as ${editedBy} has it, in ${editedBy}' place.`,
            ];
        }
        case 'property':
        case 'override':
        case 'move':
        case 'same-id':
        case 'top-level':
            return [
                ...where,
                ...(conflict.key === null ? [] : [`- Key: \`${conflict.key}\``]),
                `- Base: ${formatPenValue(conflict.base)}`,
                `- Ours (kept): ${formatPenValue(conflict.ours)}`,
                `- Theirs: ${formatPenValue(conflict.theirs)}`,
            ];
        default:
            return assertNever(conflict);
    }
}

function formatNode(node: PenConflictNode): string {
    const name = node.name === null ? '' : ` "${node.name}"`;
    const frame =
        node.frame.id === node.id
            ? ''
            : ` on ${node.frame.name === null ? '' : `"${node.frame.name}" `}(\`${node.frame.id}\`)`;
    return `\`${node.id}\`${name}${frame}`;
}
