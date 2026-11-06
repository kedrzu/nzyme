import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

/**
 * End-to-end coverage through the real `oxlint` binary, as in `noUnusedNoSideEffectsResult.test.ts`
 * (`RuleTester` does not work under Bun). The fixture config extends the real preset, so the
 * `overrides` entry that scopes the rule to stories is what is tested, not a copy of it.
 */
const RULE_CODE = 'nzyme(no-aria-on-component-in-story)';

/** The built plugin: the preset's `jsPlugins` entry resolves to it, so it must exist. */
const PLUGIN_PATH = join(import.meta.dir, '..', 'dist', 'index.js');

const PRESET_PATH = join(import.meta.dir, '..', '..', 'eslint', 'oxlintrc.json');

const OXLINT_BIN = join(dirname(fileURLToPath(import.meta.resolve('oxlint/package.json'))), 'bin', 'oxlint');

interface OxlintJsonReport {
    diagnostics: OxlintJsonDiagnostic[];
}

interface OxlintJsonDiagnostic {
    code: string;
    message: string;
    filename: string;
    labels: { span: { line: number } }[];
}

const STORY = `export const Default = () => (
    <div>
        <Button aria-label="Close" />
        <Foo.Bar aria-hidden="true" />
        <button aria-label="Close" />
        <my-el aria-label="Close" />
        <svg:rect aria-label="Close" />
    </div>
);
`;

let root: string;

beforeAll(() => {
    if (!existsSync(PLUGIN_PATH)) {
        throw new Error(
            `No built plugin at ${PLUGIN_PATH}. Run \`tsgo --build\` first — oxlint loads the plugin's built output, so this test cannot fall back to the source.`,
        );
    }
});

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nzyme-oxlint-aria-'));
    await writeFile(join(root, '.oxlintrc.json'), JSON.stringify({ extends: [PRESET_PATH] }), 'utf8');
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe('nzyme/no-aria-on-component-in-story', () => {
    it('reports aria attributes on components and member-expression components, not on native elements', async () => {
        const diagnostics = await lint({ 'case.stories.tsx': STORY });

        expect(diagnostics.map(diagnostic => diagnostic.labels[0]?.span.line)).toEqual([
            lineOf(STORY, '<Button'),
            lineOf(STORY, '<Foo.Bar'),
        ]);
        expect(diagnostics[0]?.message).toContain('`aria-label`');
        expect(diagnostics[0]?.message).toContain('`<Button>`');
        expect(diagnostics[1]?.message).toContain('`aria-hidden`');
        expect(diagnostics[1]?.message).toContain('`<Foo.Bar>`');
    });

    it('says to fix the component and to use a prop with a translated default', async () => {
        const [diagnostic] = await lint({ 'case.stories.tsx': STORY });

        expect(diagnostic?.message).toContain('Fix the component rather than the story');
        expect(diagnostic?.message).toContain('prop with a translated default');
    });

    it('ignores a file that is not a story', async () => {
        expect(await lint({ 'case.tsx': STORY })).toEqual([]);
    });
});

/** Writes the fixtures and returns only this rule's diagnostics. The preset's other rules are filtered out. */
async function lint(files: Record<string, string>): Promise<OxlintJsonDiagnostic[]> {
    for (const [name, content] of Object.entries(files)) {
        await writeFile(join(root, name), content, 'utf8');
    }

    // oxlint exits 1 whenever it reported anything, so the exit code carries no signal here.
    const run = Bun.spawnSync([OXLINT_BIN, '-c', join(root, '.oxlintrc.json'), '--format=json', root], { cwd: root });
    const stdout = run.stdout.toString();
    if (stdout.length === 0) {
        throw new Error(`oxlint produced no JSON report. stderr:\n${run.stderr.toString()}`);
    }

    const report = JSON.parse(stdout) as OxlintJsonReport;

    return report.diagnostics.filter(diagnostic => diagnostic.code === RULE_CODE);
}

/** Line of `snippet` in the fixture, so an expectation survives edits above it. */
function lineOf(source: string, snippet: string): number {
    const index = source.indexOf(snippet);
    if (index < 0) {
        throw new Error(`Fixture does not contain ${JSON.stringify(snippet)}`);
    }

    return source.slice(0, index).split('\n').length;
}
