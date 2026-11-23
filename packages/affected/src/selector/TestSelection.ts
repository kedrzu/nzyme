import type { AffectedFullRunReason } from '../base/selectAffectedFiles.js';
import type { TestUnit } from '../store/VariantStore.js';
import type { SuiteChange } from './suiteFingerprint.js';

/** Which tests of a suite to run and which to skip, each with its reason. */
export interface TestSelection {
    run: SelectedTest<TestRunReason>[];
    skip: SelectedTest<TestSkipReason>[];
    /**
     * Set when tests have variants but none has a current suite fingerprint: a suite input changed,
     * so everything runs. Names the first changed input of the newest variant.
     */
    fullRun?: SuiteChange;
}

/** A test and why it was put where it is. */
export interface SelectedTest<TReason> {
    unit: TestUnit;
    reason: TReason;
}

/**
 * Why a test runs:
 * - `no-variant` — nothing recorded for it (a traced suite);
 * - `changed` — its newest variant with a current suite fingerprint depends on `file`, which changed —
 *   or `file` is a listing key (`package:<dir>`, `directory:<dir>`, see `FileListing`) whose files
 *   gained or lost one;
 * - `suite-changed` — every variant's suite fingerprint is stale, or (a test with no variant) the
 *   suite's inputs changed (`TestSelection.fullRun`);
 * - `affected` — nothing recorded for it, and the change since the base reaches it (a static suite).
 */
export type TestRunReason =
    | { kind: 'no-variant' }
    | { kind: 'changed'; file: string }
    | { kind: 'suite-changed'; change: SuiteChange }
    | { kind: 'affected'; fullRun?: AffectedFullRunReason };

/**
 * Why a test is skipped:
 * - `variant` — a recorded variant matches the current code;
 * - `unaffected` — nothing recorded for it, and the change since the base does not reach it (a static suite).
 */
export type TestSkipReason = { kind: 'variant'; recordedAt: string } | { kind: 'unaffected' };
