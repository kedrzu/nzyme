import type {
    SelectedTest,
    TestRunReason,
    TestSelection,
    TestSkipReason,
} from '@nzyme/affected/selector/TestSelection.js';
import type { SuiteChange } from '@nzyme/affected/selector/suiteFingerprint.js';
import { assertNever } from '@nzyme/utils/assertNever.js';

/** How many changed files a summary names before it says `…`. */
const NAMED_FILES = 3;

/**
 * The one-line summary of a suite selection, with the reasons:
 * `full run: change in db/0002.sql (trigger) · 3 run (2 changed: a.ts, b.ts; 1 no variant), 40 skipped (variant match)`.
 * @__NO_SIDE_EFFECTS__
 */
export function describeTestSelection(selection: TestSelection): string {
    const parts: string[] = [];
    if (selection.fullRun) {
        parts.push(`full run: ${describeSuiteChange(selection.fullRun)}`);
    }
    parts.push(
        withReasons(`${selection.run.length} run`, describeRunReasons(selection.run)),
        withReasons(`${selection.skip.length} skipped`, describeSkipReasons(selection.skip)),
    );
    return parts.join(' · ');
}

function describeRunReasons(run: readonly SelectedTest<TestRunReason>[]): string[] {
    const changed = new Set<string>();
    let changedCount = 0;
    let noVariant = 0;
    let affected = 0;
    const suiteChanges = new Map<string, number>();
    let fullRunSinceBase: string | undefined;

    for (const { reason } of run) {
        switch (reason.kind) {
            case 'changed':
                changedCount++;
                changed.add(reason.file);
                break;
            case 'no-variant':
                noVariant++;
                break;
            case 'suite-changed': {
                const label = describeSuiteChange(reason.change);
                suiteChanges.set(label, (suiteChanges.get(label) ?? 0) + 1);
                break;
            }
            case 'affected':
                affected++;
                if (reason.fullRun) {
                    fullRunSinceBase ??= `${reason.fullRun.file} matches trigger "${reason.fullRun.trigger}"`;
                }
                break;
            default:
                assertNever(reason);
        }
    }

    const reasons: string[] = [];
    if (changedCount > 0) {
        const files = [...changed].toSorted();
        const named = files.slice(0, NAMED_FILES).join(', ') + (files.length > NAMED_FILES ? ', …' : '');
        reasons.push(`${changedCount} changed: ${named}`);
    }
    for (const [label, count] of suiteChanges) {
        reasons.push(`${count} suite ${label}`);
    }
    if (noVariant > 0) {
        reasons.push(`${noVariant} no variant`);
    }
    if (affected > 0) {
        reasons.push(`${affected} affected since base` + (fullRunSinceBase ? ` (full run: ${fullRunSinceBase})` : ''));
    }
    return reasons;
}

function describeSkipReasons(skip: readonly SelectedTest<TestSkipReason>[]): string[] {
    let variant = 0;
    let unaffected = 0;
    for (const { reason } of skip) {
        switch (reason.kind) {
            case 'variant':
                variant++;
                break;
            case 'unaffected':
                unaffected++;
                break;
            default:
                assertNever(reason);
        }
    }

    const reasons: string[] = [];
    if (variant > 0) {
        reasons.push(`${variant} variant match`);
    }
    if (unaffected > 0) {
        reasons.push(`${unaffected} unaffected since base`);
    }
    return reasons;
}

/** `change in db/0002.sql (trigger)`; `selection config changed` for the config. */
function describeSuiteChange(change: SuiteChange): string {
    return change.role === 'config' ? 'selection config changed' : `change in ${change.file} (${change.role})`;
}

/** `3 run (2 changed: a.ts; 1 no variant)`; a single reason drops its count: `40 skipped (variant match)`. */
function withReasons(head: string, reasons: string[]): string {
    if (reasons.length === 0) {
        return head;
    }
    const shown = reasons.length === 1 ? reasons.map(reason => reason.replace(/^\d+ /, '')) : reasons;
    return `${head} (${shown.join('; ')})`;
}
