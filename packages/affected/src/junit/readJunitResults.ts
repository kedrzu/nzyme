import { readFile } from 'node:fs/promises';

import { isPlainObject } from '@nzyme/utils/isPlainObject.js';
import { xmlParse } from '@nzyme/xml-utils/xmlParse.js';

/**
 * The outcome of one test file in a JUnit report:
 * - `failed` — a testcase has a `<failure>` or `<error>`, or a `<testsuite>` of the file counts failures
 *   or errors no testcase shows (a failed `beforeAll`);
 * - `passed` — not failed, and at least one testcase ran;
 * - `skipped` — every testcase was skipped.
 */
export interface JunitFileResult {
    /** The path as the report names it: absolute, or relative to the runner's root. */
    file: string;
    status: 'passed' | 'failed' | 'skipped';
}

/** Reads a JUnit XML report and returns the outcome of each test file, in report order. */
export async function readJunitResults(file: string): Promise<JunitFileResult[]> {
    return parseJunitResults(await readFile(file, 'utf8'));
}

/**
 * Parses a JUnit XML report into the outcome of each test file. The file of a testcase is its `file`
 * attribute (bun test, vitest with `addFileAttribute`), else the nearest `<testsuite file>`, else the
 * name of its outermost `<testsuite>` (vitest names it after the file). A testcase with none of them is
 * ignored.
 * @__NO_SIDE_EFFECTS__
 */
export function parseJunitResults(xml: string): JunitFileResult[] {
    const results = new Map<string, JunitFileResult['status']>();
    const document: XmlObject = xmlParse(xml);
    const top = isPlainObject(document.testsuites) ? document.testsuites.testsuite : document.testsuite;
    for (const suite of toElements(top)) {
        visitSuite(suite, readString(suite['@_file']) ?? readString(suite['@_name']));
    }
    return [...results].map(([file, status]) => ({ file, status }));

    function visitSuite(suite: XmlObject, suiteFile: string | undefined): void {
        const file = readString(suite['@_file']) ?? suiteFile;
        if (file !== undefined && (readCount(suite['@_failures']) > 0 || readCount(suite['@_errors']) > 0)) {
            results.set(file, 'failed');
        }

        for (const testcase of toElements(suite.testcase)) {
            const testcaseFile = readString(testcase['@_file']) ?? file;
            if (testcaseFile !== undefined) {
                setStatus(testcaseFile, getTestcaseStatus(testcase));
            }
        }
        for (const nested of toElements(suite.testsuite)) {
            visitSuite(nested, file);
        }
    }

    function setStatus(file: string, status: JunitFileResult['status']): void {
        const current = results.get(file);
        if (current === undefined || current === 'skipped' || status === 'failed') {
            results.set(file, status);
        }
    }
}

/** A parsed XML element: attributes (`@_name`) and child elements by tag name. */
type XmlObject = Record<string, unknown>;

function getTestcaseStatus(testcase: XmlObject): JunitFileResult['status'] {
    if (testcase.failure !== undefined || testcase.error !== undefined) {
        return 'failed';
    }
    return testcase.skipped === undefined ? 'passed' : 'skipped';
}

/** One element or a list of them (the parser collapses a single child); text-only nodes are dropped. */
function toElements(node: unknown): XmlObject[] {
    const nodes: unknown[] = Array.isArray(node) ? node : [node];
    return nodes.filter(isPlainObject);
}

function readString(node: unknown): string | undefined {
    return typeof node === 'string' && node !== '' ? node : undefined;
}

function readCount(node: unknown): number {
    const count = typeof node === 'string' ? Number(node) : 0;
    return Number.isFinite(count) ? count : 0;
}
