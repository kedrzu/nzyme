import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, beforeEach } from 'bun:test';

/** The built plugin, because that is what ships and what a `jsPlugins` entry points at. */
export const PLUGIN_PATH = join(import.meta.dir, '..', 'dist', 'index.js');

/**
 * Resolved through the package rather than a fixed `node_modules/.bin` path: when nzyme is checked
 * out as a submodule its dependencies hoist to the parent workspace and `nzyme/node_modules` does
 * not exist at all. Resolution therefore lands on whichever `oxlint` the surrounding workspace
 * lints with, which is the version the plugin has to work against.
 */
const OXLINT_BIN = join(dirname(fileURLToPath(import.meta.resolve('oxlint/package.json'))), 'bin', 'oxlint');

export interface OxlintJsonDiagnostic {
    code: string;
    message: string;
    filename: string;
    labels: { span: { line: number } }[];
}

interface OxlintJsonReport {
    diagnostics: OxlintJsonDiagnostic[];
}

interface OxlintTestHarnessOptions {
    /** The `.oxlintrc.json` content written into each test's fixture directory. */
    config: object;
    /** The `code` of the diagnostics to keep, e.g. `nzyme(no-aria-on-component-in-story)`. */
    ruleCode: string;
}

/**
 * Registers the `bun:test` hooks that give every test a fresh fixture directory and an `.oxlintrc.json`,
 * and returns `lint`, which writes fixtures there, spawns the real `oxlint` binary and returns only
 * the diagnostics of `ruleCode`. Call it at the top level of a test file.
 */
export function useOxlintHarness({ config, ruleCode }: OxlintTestHarnessOptions): {
    lint: (files: Record<string, string>) => Promise<OxlintJsonDiagnostic[]>;
} {
    let root: string;

    beforeAll(() => {
        if (!existsSync(PLUGIN_PATH)) {
            throw new Error(
                `No built plugin at ${PLUGIN_PATH}. Run \`tsgo --build\` first — oxlint loads the plugin's built output, so this test cannot fall back to the source.`,
            );
        }
    });

    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'nzyme-oxlint-'));
        await writeFile(join(root, '.oxlintrc.json'), JSON.stringify(config), 'utf8');
    });

    afterEach(async () => {
        await rm(root, { recursive: true, force: true });
    });

    /** Writes the fixture files and returns only the diagnostics `ruleCode` raised. */
    async function lint(files: Record<string, string>): Promise<OxlintJsonDiagnostic[]> {
        for (const [name, content] of Object.entries(files)) {
            await writeFile(join(root, name), content, 'utf8');
        }

        // oxlint exits 1 whenever it reported anything at all, so the exit code carries no signal here.
        // Its type-stripping `ExperimentalWarning` goes to stderr, which is why only stdout is read.
        const run = Bun.spawnSync([OXLINT_BIN, '-c', join(root, '.oxlintrc.json'), '--format=json', root], {
            cwd: root,
        });
        const stdout = run.stdout.toString();
        if (stdout.length === 0) {
            throw new Error(`oxlint produced no JSON report. stderr:\n${run.stderr.toString()}`);
        }

        const report = JSON.parse(stdout) as OxlintJsonReport;

        // Only this rule's findings: oxlint's own default categories and a preset's other rules stay on.
        return report.diagnostics.filter(diagnostic => diagnostic.code === ruleCode);
    }

    return { lint };
}

/** Line of `snippet` in the fixture, so an expectation survives edits above it. */
export function lineOf(source: string, snippet: string): number {
    const index = source.indexOf(snippet);
    if (index < 0) {
        throw new Error(`Fixture does not contain ${JSON.stringify(snippet)}`);
    }

    return source.slice(0, index).split('\n').length;
}
