import { getTestUnitKey } from '../store/VariantStore.js';
import type { TestUnit } from '../store/VariantStore.js';
import type { SelectedTest, TestSelection, TestSkipReason } from './TestSelection.js';

/**
 * The self-check of a full run: the failed tests that `selection` (made before the run) would have
 * skipped. Each is a hole in what the selection sees — a dependency no trace or import recorded —
 * and its matching variants are wrong: invalidate them.
 * @__NO_SIDE_EFFECTS__
 */
export function auditSelection(failed: readonly TestUnit[], selection: TestSelection): SelectedTest<TestSkipReason>[] {
    const failedKeys = new Set(failed.map(unit => getTestUnitKey(unit)));
    return selection.skip.filter(skipped => failedKeys.has(getTestUnitKey(skipped.unit)));
}
