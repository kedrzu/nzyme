import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { readTracedTestResults } from '@nzyme/affected/playwright/TracedTestResult.js';
import { openTestSelector } from '@nzyme/affected/selector/openTestSelector.js';
import { Option } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import { GitRepository } from '@nzyme/project-utils/git/GitRepository.js';
import { sumOver } from '@nzyme/utils/array/sumOver.js';

import { recordTracedResults } from '../affected/recordTracedResults.js';
import type { TracedRecording } from '../affected/recordTracedResults.js';
import type { SelectionSnapshot } from '../affected/SelectionSnapshot.js';

/**
 * Records the results of a traced run (written by `@nzyme/trace`'s reporter) as variants of its
 * suite, against the snapshot `nzyme git affected-test-list` took before the run. A problem only costs
 * the recording: it is reported, never failing the run. See the ADR
 * `docs/decisions/file-level-affected-selection-by-full-import-scan.md`.
 */
export class GitAffectedRecordCommand extends Command {
    static override paths = [['git', 'affected-record']];

    static override usage = Command.Usage({
        category: 'Testing',
        description: 'Record the results of a traced test run as variants of its suite',
        details: `
            Reads the results file the \`@nzyme/trace\` reporter wrote (\`--results\`): a passed test
            with a complete trace gets a variant, unless a file it depends on was edited since the
            selection the snapshot holds (\`--snapshot\`, written by \`nzyme git affected-test-list\`);
            a test with any failed attempt has its matching variants invalidated and records nothing,
            also when the snapshot is missing; an incomplete trace records nothing and is counted by
            reason. Always exits 0.

            \`--full\`, after a run of every test, also reports each failed test the selection had
            skipped — a tracing gap.
        `,
        examples: [
            [
                'Record the results of the traced e2e run',
                'nzyme git affected-record --suite e2e --results results.ndjson --snapshot snapshot.json',
            ],
        ],
    });

    suite = Option.String('--suite', { required: true, description: 'A suite of `nzyme.affected.suites`' });

    results = Option.String('--results', {
        required: true,
        description: 'The results file the `@nzyme/trace` reporter wrote',
    });

    snapshot = Option.String('--snapshot', {
        required: true,
        description: 'The snapshot `nzyme git affected-test-list` wrote before the run',
    });

    full = Option.Boolean('--full', false, {
        description: 'Report the failed tests the selection had skipped (after a run of every test)',
    });

    cwd = process.cwd();

    /**
     * Execute the command.
     */
    override async run() {
        const { stderr } = this.context;
        const root = await new GitRepository(this.cwd).git(['rev-parse', '--show-toplevel']);
        const snapshot = await this.readSnapshot();
        const results = await readTracedTestResults(path.resolve(this.cwd, this.results));

        if (typeof snapshot === 'string') {
            // A failure still disproves the variants it matches; only recording needs the snapshot.
            const selector = await openTestSelector({ root, suite: this.suite });
            const recording = await recordTracedResults(selector, results, { invalidateOnly: true });
            stderr.write(`nzyme git affected: no variants recorded, ${snapshot}\n`);
            if (recording.failed.length > 0) {
                stderr.write(`${describeTracedRecording(recording)}\n`);
            }
            return 0;
        }

        const selector = await openTestSelector({ root, suite: this.suite, snapshot: snapshot.selector });
        const recording = await recordTracedResults(selector, results);
        stderr.write(`${describeTracedRecording(recording)}\n`);
        if (!this.full) {
            return 0;
        }
        for (const { unit, reason } of selector.audit(recording.failed, snapshot.selection)) {
            stderr.write(
                `nzyme git affected: tracing gap: ${[unit.file, ...(unit.title ?? [])].join(' › ')} failed, ` +
                    `yet the selection skipped it (${reason.kind}) — its variants were invalidated\n`,
            );
        }
        return 0;
    }

    /** The snapshot of this suite, or why there is none to record against. */
    private async readSnapshot(): Promise<SelectionSnapshot | string> {
        let snapshot: SelectionSnapshot;
        try {
            snapshot = JSON.parse(await readFile(path.resolve(this.cwd, this.snapshot), 'utf8')) as SelectionSnapshot;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return `cannot read the snapshot: ${message}`;
        }
        if (snapshot.suite !== this.suite) {
            return `the snapshot is of suite "${snapshot.suite}", not "${this.suite}"`;
        }
        return snapshot;
    }
}

/** `nzyme git affected: recorded 5 · 1 failed (2 variants invalidated) · 2 not recorded (no-heartbeat: 1, edited: 1)`. */
function describeTracedRecording(recording: TracedRecording): string {
    const parts = [`nzyme git affected: recorded ${recording.recorded}`];
    if (recording.failed.length > 0) {
        parts.push(`${recording.failed.length} failed (${recording.invalidated} variants invalidated)`);
    }
    if (recording.refused.size > 0) {
        const total = sumOver(recording.refused.values(), count => count);
        const reasons = [...recording.refused].map(([reason, count]) => `${reason}: ${count}`);
        parts.push(`${total} not recorded (${reasons.join(', ')})`);
    }
    return parts.join(' · ');
}
