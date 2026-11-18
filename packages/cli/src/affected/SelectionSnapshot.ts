import type { TestSelectorSnapshot } from '@nzyme/affected/selector/openTestSelector.js';
import type { TestSelection } from '@nzyme/affected/selector/TestSelection.js';

/**
 * The `--snapshot` file: what the selection of `nzyme git affected-test-list` saw before a traced run,
 * read by `nzyme git affected-record` after it.
 */
export interface SelectionSnapshot {
    suite: string;
    selector: TestSelectorSnapshot;
    /** The selection made, for the audit of a full run. */
    selection: TestSelection;
}
