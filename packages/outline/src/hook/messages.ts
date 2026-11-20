import { arrayRemoveDuplicates } from '@nzyme/utils/array/arrayRemoveDuplicates.js';

import type { SyncState } from '../state/StateStore.js';
import type { SyncRun } from '../sync/syncOnce.js';

/** How many paths a list names before "and N more". */
const LISTED = 10;

export interface RenderReportParams {
    run: SyncRun;
    /** The state after the run; its `events` are all reported here. */
    state: SyncState;
    /** Put before a path in the documents folder, e.g. `documents/`. */
    documents: string;
    /** Put before a path in the recovered folder. */
    recovered: string;
    /** The files in the recovered folder now, relative to it. */
    recoveredFiles: string[];
    /** How the agent runs the commands, e.g. `outline`. */
    commandHint: string;
    /** The language the agent speaks to the user, e.g. `Polish`; unset, the user's own language. */
    userLanguage?: string;
}

/**
 * The agent's context after a sync run: what this run did, then the states that last until someone acts (open
 * conflicts, unresolved share names, an unfinished first pull, refused archives, recovered files), then the
 * one-time events. Empty when there is nothing to say.
 */
export function renderReport(params: RenderReportParams): string {
    const { run, state, documents, recovered } = params;
    const plain = plainIn(params.userLanguage);
    const docs = (paths: string[]) => listed(paths.map(path => `${documents}${path}`));
    const paragraphs: string[] = [];

    const conflicts = arrayRemoveDuplicates(
        [
            ...Object.values(state.documents).flatMap(document =>
                document.conflictRevision == null ? [] : [document.path],
            ),
            ...(run.push?.conflicts ?? []),
        ],
        path => path,
    ).toSorted();
    const conflicted = new Set(conflicts);

    const cameIn = arrayRemoveDuplicates(
        [
            ...(run.pull?.written ?? []),
            ...(run.pull?.moved.map(move => move.to) ?? []),
            ...(run.sharing?.written.map(change => change.path) ?? []),
        ],
        path => path,
    ).filter(path => !conflicted.has(path));
    if (cameIn.length > 0) {
        paragraphs.push(
            `Outline sync: these files changed from Outline (other people's edits, moves or sharing): ${docs(cameIn)}. ` +
                `Re-read a file before editing it. Tell the user ${plain} only what matters to their work.`,
        );
    }
    const removed = run.pull?.removed ?? [];
    if (removed.length > 0) {
        paragraphs.push(
            `Outline sync: removed locally, because they were deleted in Outline or are no longer shared with the user: ${docs(removed)}.`,
        );
    }
    const merged = (run.pull?.toPush ?? []).filter(path => !conflicted.has(path));
    if (merged.length > 0) {
        paragraphs.push(
            `Outline sync: merged Outline's changes with the local unsent edits, both kept: ${docs(merged)}.`,
        );
    }

    const push = run.push;
    if (push) {
        const sent = arrayRemoveDuplicates(
            [...push.created, ...push.updated, ...push.moved.map(move => move.to)],
            path => path,
        );
        if (sent.length > 0) {
            paragraphs.push(`Outline sync: sent to Outline: ${docs(sent)}.`);
        }
        if (push.archived.length > 0) {
            paragraphs.push(`Outline sync: deleted here, so archived in Outline: ${docs(push.archived)}.`);
        }
        const lookup = run.privateCollection;
        const missingCollection = lookup != null && lookup.id == null;
        const atRoot = missingCollection ? push.skipped.filter(skip => !skip.path.includes('/')) : [];
        if (lookup != null && atRoot.length > 0) {
            paragraphs.push(
                `Outline sync: a file at the top of ${documents} goes to the user's private Outline collection ` +
                    `"${lookup.name}", which does not exist, so these were not sent: ${docs(atRoot.map(skip => skip.path))}. ` +
                    `Tell the user ${plain} that they or an Outline admin need to create a private collection named "${lookup.name}"; ` +
                    "until then a document can go into an existing collection's folder instead.",
            );
        }
        const skipped = push.skipped.filter(skip => !atRoot.includes(skip));
        if (skipped.length > 0) {
            const lines = skipped.slice(0, LISTED).map(skip => `- ${documents}${skip.path}: ${skip.reason}`);
            paragraphs.push(['Outline sync: not sent this time:', ...lines, ...more(skipped.length)].join('\n'));
        }
        if (push.refusedArchives) {
            paragraphs.push(
                `Outline sync: ${push.refusedArchives.reason} Missing: ${docs(push.refusedArchives.paths)}. ` +
                    'If the files were not meant to be deleted, bring them back (from git, or ask the user). ' +
                    `If the user did delete them, tell them ${plain} that this many documents have to be deleted in Outline itself.`,
            );
        }
    }

    if (conflicts.length > 0) {
        paragraphs.push(conflictInstructions(docs(conflicts), plain));
    }

    const unresolved = Object.values(state.documents).flatMap(document =>
        (document.sharing?.unresolved ?? []).map(entry => `"${entry}" in \`${documents}${document.path}\``),
    );
    if (unresolved.length > 0) {
        paragraphs.push(
            `Outline sync: these \`shared:\` entries match no Outline user or group (or several): ${limited(unresolved)}. ` +
                'Ask the user who they meant, then write the full name or e-mail as Outline has it.',
        );
    }

    if (!state.initialPull.complete) {
        paragraphs.push(
            `Outline sync: the first download from Outline is not finished, so ${documents} is incomplete; ` +
                `it continues in the background. A document missing locally may still exist; \`${params.commandHint} pull\` finishes the download now.`,
        );
    }

    const recoveredEvents = state.events.flatMap(event => (event.kind === 'recovered' ? [event.path] : []));
    if (recoveredEvents.length > 0) {
        paragraphs.push(
            `Outline sync: moved to ${recovered}: ${listed(recoveredEvents.map(path => `${recovered}${path}`))}. ` +
                'Each was deleted in Outline or stopped being shared with the user, but held local edits never sent. ' +
                `Tell the user ${plain} and ask whether to restore it (moved back into a collection folder it is created anew) or delete it.`,
        );
    } else if (params.recoveredFiles.length > 0) {
        paragraphs.push(
            `Outline sync: ${recovered} holds files rescued from documents gone from Outline, waiting for the user's decision ` +
                `(restore into a collection folder, or delete): ${listed(params.recoveredFiles.map(path => `${recovered}${path}`))}.`,
        );
    }

    for (const event of state.events) {
        if (event.kind === 'share-rejected') {
            paragraphs.push(
                `Outline sync: Outline refused to share ${documents}${event.path} with ${event.email} (${event.reason}); ` +
                    `its \`shared:\` list was set back to what Outline has. Tell the user ${plain}.`,
            );
        }
    }

    return paragraphs.join('\n\n');
}

/** The Stop hook's `reason`: conflicts the push just created, which the agent resolves before ending its turn. */
export function renderStopBlock(conflicts: string[], documents: string, userLanguage?: string): string {
    return [
        conflictInstructions(listed(conflicts.map(path => `${documents}${path}`)), plainIn(userLanguage)),
        'Do it now, then end your turn the way you were about to: if your last message asked the user something, ask it again briefly.',
    ].join('\n\n');
}

/** The user has no usable Outline login; the agent starts the login itself. */
export function renderLoginNeeded(commandHint: string, userLanguage?: string): string {
    return (
        'Outline sync: the user is not logged in to Outline (or the login expired), so documents are not syncing. ' +
        `Run \`${commandHint} login\` yourself now: it opens the user's browser, where they only click "Allow". ` +
        `Tell them ${plainIn(userLanguage)} what the browser window is for.`
    );
}

/** Outline cannot be reached; local work is kept and sent later. */
export function renderOffline(): string {
    return (
        'Outline sync: Outline cannot be reached (no network, or Outline is down), so documents are not syncing for now; ' +
        'local edits are kept and sent once it is back. Mention it to the user only when it matters to their work.'
    );
}

/** Any other failure: one line, the details in the log. */
export function renderFailure(logPath: string): string {
    return `Outline sync failed; details in ${logPath}. If it keeps failing, tell the user documents are not syncing with Outline.`;
}

function conflictInstructions(files: string, plain: string): string {
    return (
        `Outline sync: conflict in ${files}: the same paragraph was changed here and in Outline. ` +
        'The file holds both versions between `<<<<<<< local` and `>>>>>>> Outline (name)` markers, and is not sent until they are gone. ' +
        `Resolve it: when both changes can stand together, keep both intents; when they contradict, show the user both versions ${plain} and ask which to keep. ` +
        'Then remove every marker line.'
    );
}

/** The phrase telling the agent how to word what it says to the user. */
function plainIn(userLanguage: string | undefined): string {
    return userLanguage ? `in plain ${userLanguage}` : "in plain words, in the user's language";
}

function listed(paths: string[]): string {
    return limited(paths.map(path => `\`${path}\``));
}

function limited(items: string[]): string {
    const shown = items.slice(0, LISTED).join(', ');
    return items.length > LISTED ? `${shown} and ${items.length - LISTED} more` : shown;
}

function more(total: number): string[] {
    return total > LISTED ? [`- and ${total - LISTED} more`] : [];
}
