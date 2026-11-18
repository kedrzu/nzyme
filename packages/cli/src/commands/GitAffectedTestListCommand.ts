import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { formatPlaywrightTestList, readPlaywrightTestList } from '@nzyme/affected/playwright/playwrightTestList.js';
import { openTestSelector } from '@nzyme/affected/selector/openTestSelector.js';
import { getTestUnitKey } from '@nzyme/affected/store/VariantStore.js';
import { Option } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import { GitRepository } from '@nzyme/project-utils/git/GitRepository.js';

import { describeTestSelection } from '../affected/describeTestSelection.js';
import type { SelectionSnapshot } from '../affected/SelectionSnapshot.js';

/**
 * Selects the single tests of a traced suite (Playwright) from their recorded variants and writes them
 * as a Playwright `--test-list` file — the step before a traced run, whose results
 * `nzyme git affected-record` stores after it. See the ADR
 * `docs/decisions/file-level-affected-selection-by-full-import-scan.md`.
 */
export class GitAffectedTestListCommand extends Command {
    static override paths = [['git', 'affected-test-list']];

    static override usage = Command.Usage({
        category: 'Testing',
        description: 'Select single Playwright tests from their recorded variants and write them as a test list',
        details: `
            Reads the tests from the output of \`playwright test --list --reporter=json\` (\`--units\`),
            skips each one a recorded variant of the suite still matches, and writes the rest as a
            Playwright \`--test-list\` file (\`--out\`); an empty file selects nothing. Exits 0 whatever
            is selected; the summary with the reasons goes to stderr.

            \`--snapshot <file>\` also writes the selection and the state of the code it saw, for
            \`nzyme git affected-record\` after the run.
        `,
        examples: [
            [
                'Select the e2e tests the change can affect',
                'nzyme git affected-test-list --suite e2e --units units.json --out selected.txt --snapshot snapshot.json',
            ],
        ],
    });

    suite = Option.String('--suite', { required: true, description: 'A suite of `nzyme.affected.suites`' });

    units = Option.String('--units', {
        required: true,
        description: 'The output of `playwright test --list --reporter=json`',
    });

    out = Option.String('--out', { required: true, description: 'Where to write the selected tests' });

    snapshot = Option.String('--snapshot', {
        description: 'Where to write the selection and the code state it saw, for `nzyme git affected-record`',
    });

    cwd = process.cwd();

    /**
     * Execute the command.
     */
    override async run() {
        const root = await new GitRepository(this.cwd).git(['rev-parse', '--show-toplevel']);
        const selector = await openTestSelector({ root, suite: this.suite });
        const tests = await readPlaywrightTestList(path.resolve(this.cwd, this.units), root);
        const selection = await selector.select(tests.map(test => test.unit));
        const run = new Set(selection.run.map(test => getTestUnitKey(test.unit)));

        await writeFile(
            path.resolve(this.cwd, this.out),
            formatPlaywrightTestList(tests.filter(test => run.has(getTestUnitKey(test.unit)))),
        );
        if (this.snapshot !== undefined) {
            const snapshot: SelectionSnapshot = { suite: this.suite, selector: selector.snapshot(), selection };
            await writeFile(path.resolve(this.cwd, this.snapshot), JSON.stringify(snapshot));
        }
        this.context.stderr.write(
            `nzyme git affected-test-list --suite ${this.suite}: ${describeTestSelection(selection)}\n`,
        );
        return 0;
    }
}
