import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

/**
 * End-to-end coverage: the rule is exercised by spawning the real `oxlint` binary over generated
 * fixtures, not through `oxlint/plugins-dev`'s `RuleTester`. The tester allocates a 6 GiB
 * `ArrayBuffer` for raw AST transfer, which Bun refuses, and it throws outright on any runtime other
 * than Node. Spawning also proves the whole path a developer gets: config loading, plugin loading,
 * and the built output rather than the source.
 *
 * Fixtures are written at runtime so that deliberately-broken code never lands in the tree, where it
 * would have to be excluded from `bun lint` and from the tsconfig solution.
 */
const RULE_CODE = 'nzyme(no-unused-no-side-effects-result)';

/** The built plugin, because that is what ships and what a `jsPlugins` entry points at. */
const PLUGIN_PATH = join(import.meta.dir, '..', 'dist', 'index.js');

/**
 * Resolved through the package rather than a fixed `node_modules/.bin` path: when nzyme is checked
 * out as a submodule its dependencies hoist to the parent workspace and `nzyme/node_modules` does
 * not exist at all. Resolution therefore lands on whichever `oxlint` the surrounding workspace
 * lints with, which is the version the plugin has to work against.
 */
const OXLINT_BIN = join(dirname(fileURLToPath(import.meta.resolve('oxlint/package.json'))), 'bin', 'oxlint');

/** Local declarations every same-file case calls into: annotated, unannotated, and annotated async. */
const DECLARATIONS = `/**
 * Adds one.
 * @__NO_SIDE_EFFECTS__
 */
function pure(value: number): number {
    return value + 1;
}

/** The same shape, deliberately not annotated. */
function plain(value: number): number {
    return value + 2;
}

/**
 * Adds three.
 * @__NO_SIDE_EFFECTS__
 */
async function pureAsync(value: number): Promise<number> {
    return value + 3;
}

declare function take(value: number): void;
`;

const IMPORTED_DECLARATIONS = `/**
 * Adds one.
 * @__NO_SIDE_EFFECTS__
 */
export function pure(value: number): number {
    return value + 1;
}

/** The same shape, deliberately not annotated. */
export function plain(value: number): number {
    return value + 2;
}
`;

/** A diagnostic from this rule, reduced to what the cases assert. */
interface RuleFinding {
    file: string;
    line: number;
}

interface OxlintJsonReport {
    diagnostics: OxlintJsonDiagnostic[];
}

interface OxlintJsonDiagnostic {
    code: string;
    message: string;
    filename: string;
    labels: OxlintJsonLabel[];
}

interface OxlintJsonLabel {
    span: OxlintJsonSpan;
}

interface OxlintJsonSpan {
    line: number;
}

let root: string;

beforeAll(() => {
    if (!existsSync(PLUGIN_PATH)) {
        throw new Error(
            `No built plugin at ${PLUGIN_PATH}. Run \`tsgo --build\` first — oxlint loads the plugin's built output, so this test cannot fall back to the source.`,
        );
    }
});

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nzyme-oxlint-rule-'));
    const config = {
        jsPlugins: [PLUGIN_PATH],
        rules: { 'nzyme/no-unused-no-side-effects-result': 'error' },
    };
    await writeFile(join(root, '.oxlintrc.json'), JSON.stringify(config), 'utf8');
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe('nzyme/no-unused-no-side-effects-result', () => {
    it('reports an annotated function called for its effect alone, naming it', async () => {
        const source = caller('    pure(value);\n    return value;');

        const diagnostics = await lint({ 'case.ts': source });

        expect(locations(diagnostics)).toEqual([{ file: 'case.ts', line: lineOf(source, '    pure(value);') }]);
        expect(diagnostics[0]?.message).toContain('`pure` is annotated `@__NO_SIDE_EFFECTS__`');
    });

    it('reports an annotated declaration in the same module whatever the `export` wraps it in', async () => {
        // The JSDoc precedes the `ExportNamedDeclaration`, not the declaration inside it, so an
        // earlier version of the rule saw none of these — and almost every annotated function is
        // exported. `assertCurrenciesMatch` in `@nzyme/money` is the real case it missed.
        const source = `/**
 * @__NO_SIDE_EFFECTS__
 */
export function exportedFunction(value: number): number {
    return value + 1;
}

/**
 * @__NO_SIDE_EFFECTS__
 */
export const exportedArrow = (value: number): number => value + 2;

/**
 * @__NO_SIDE_EFFECTS__
 */
export default function defaultExported(value: number): number {
    return value + 3;
}

export function caller(value: number): void {
    exportedFunction(value);
    exportedArrow(value);
    defaultExported(value);
}
`;

        expect(locations(await lint({ 'case.ts': source }))).toEqual([
            { file: 'case.ts', line: lineOf(source, '    exportedFunction(value);') },
            { file: 'case.ts', line: lineOf(source, '    exportedArrow(value);') },
            { file: 'case.ts', line: lineOf(source, '    defaultExported(value);') },
        ]);
    });

    it('reports a call discarded with void', async () => {
        const source = caller('    void pure(value);\n    return value;');

        expect(locations(await lint({ 'case.ts': source }))).toEqual([
            { file: 'case.ts', line: lineOf(source, '    void pure(value);') },
        ]);
    });

    it('reports a bare awaited call, because awaiting alone consumes nothing', async () => {
        const source = caller('    await pureAsync(value);\n    return value;');

        expect(locations(await lint({ 'case.ts': source }))).toEqual([
            { file: 'case.ts', line: lineOf(source, '    await pureAsync(value);') },
        ]);
    });

    it('reports an annotated function imported from another module', async () => {
        const source = `import { pure } from './helpers.js';

export function caller(value: number): number {
    pure(value);
    return value;
}
`;

        const diagnostics = await lint({ 'helpers.ts': IMPORTED_DECLARATIONS, 'case.ts': source });

        expect(locations(diagnostics)).toEqual([{ file: 'case.ts', line: lineOf(source, '    pure(value);') }]);
    });

    it('accepts a call whose result is assigned', async () => {
        const source = caller('    const result = pure(value);\n    return result;');

        expect(locations(await lint({ 'case.ts': source }))).toEqual([]);
    });

    it('accepts a call whose result is returned', async () => {
        expect(locations(await lint({ 'case.ts': caller('    return pure(value);') }))).toEqual([]);
    });

    it('accepts a call passed as an argument', async () => {
        const source = caller('    take(pure(value));\n    return value;');

        expect(locations(await lint({ 'case.ts': source }))).toEqual([]);
    });

    it('accepts an awaited call bound to a variable', async () => {
        const source = caller('    const result = await pureAsync(value);\n    return result;');

        expect(locations(await lint({ 'case.ts': source }))).toEqual([]);
    });

    it('accepts a returned awaited call', async () => {
        expect(locations(await lint({ 'case.ts': caller('    return await pureAsync(value);') }))).toEqual([]);
    });

    it('ignores a function that carries no annotation', async () => {
        const source = caller('    plain(value);\n    return value;');

        expect(locations(await lint({ 'case.ts': source }))).toEqual([]);
    });

    it('ignores an unannotated function imported from another module', async () => {
        const source = `import { plain } from './helpers.js';

export function caller(value: number): number {
    plain(value);
    return value;
}
`;

        expect(locations(await lint({ 'helpers.ts': IMPORTED_DECLARATIONS, 'case.ts': source }))).toEqual([]);
    });

    it('ignores a callee with no declaration in scope, as `defineProps()` has none', async () => {
        const source = caller('    defineProps();\n    return value;');

        expect(locations(await lint({ 'case.ts': source }))).toEqual([]);
    });

    it('ignores a callee imported from a bare specifier, which is out of scope', async () => {
        const source = `import { pure } from 'some-package';

export function caller(value: number): number {
    pure(value);
    return value;
}
`;

        expect(locations(await lint({ 'case.ts': source }))).toEqual([]);
    });
});

/** Writes the fixture files and returns only the diagnostics this rule raised. */
async function lint(files: Record<string, string>): Promise<OxlintJsonDiagnostic[]> {
    for (const [name, content] of Object.entries(files)) {
        await writeFile(join(root, name), content, 'utf8');
    }

    // oxlint exits 1 whenever it reported anything at all, so the exit code carries no signal here.
    // Its type-stripping `ExperimentalWarning` goes to stderr, which is why only stdout is read.
    const run = Bun.spawnSync([OXLINT_BIN, '-c', join(root, '.oxlintrc.json'), '--format=json', root], { cwd: root });
    const stdout = run.stdout.toString();
    if (stdout.length === 0) {
        throw new Error(`oxlint produced no JSON report. stderr:\n${run.stderr.toString()}`);
    }

    const report = JSON.parse(stdout) as OxlintJsonReport;

    // Only this rule's findings: oxlint's own default categories stay on in so minimal a config.
    return report.diagnostics.filter(diagnostic => diagnostic.code === RULE_CODE);
}

function locations(diagnostics: OxlintJsonDiagnostic[]): RuleFinding[] {
    return diagnostics.map(diagnostic => ({
        file: basename(diagnostic.filename),
        line: diagnostic.labels[0]!.span.line,
    }));
}

/** Wraps a statement list in a caller, on top of the shared local declarations. */
function caller(body: string): string {
    return `${DECLARATIONS}
export async function caller(value: number): Promise<number> {
${body}
}
`;
}

/** Line of `snippet` in the fixture, so an expectation survives edits above it. */
function lineOf(source: string, snippet: string): number {
    const index = source.indexOf(snippet);
    if (index < 0) {
        throw new Error(`Fixture does not contain ${JSON.stringify(snippet)}`);
    }

    return source.slice(0, index).split('\n').length;
}
