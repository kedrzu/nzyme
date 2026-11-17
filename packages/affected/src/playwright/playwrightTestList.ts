import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { relativePosixPath } from '@nzyme/project-utils/relativePosixPath.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { TestUnit } from '../store/VariantStore.js';

/** A test listed by Playwright, as a test unit and as Playwright names it. */
export interface PlaywrightListedTest {
    /** Root-relative file and the title path below it (describe titles, then the test title). */
    unit: TestUnit;
    /** The file relative to Playwright's `rootDir`, as `--test-list` expects it. */
    location: string;
}

/**
 * Reads the tests of a `playwright test --list --reporter=json` report (`JSONReport` of
 * `@playwright/test/reporter`): `config.rootDir`, then file suites whose nested `suites` are describe
 * blocks and whose `specs` are tests, each with a `file` relative to `rootDir`. A test that several
 * projects run is listed once. Paths become relative to `root`; a test outside it is dropped.
 */
export async function readPlaywrightTestList(file: string, root: string): Promise<PlaywrightListedTest[]> {
    const report: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (!isPlainObject(report) || !isPlainObject(report.config) || typeof report.config.rootDir !== 'string') {
        throw new Error(`${file} is not a Playwright JSON report: it has no config.rootDir.`);
    }

    const rootDir = await realpath(report.config.rootDir);
    const realRoot = await realpath(root);
    const tests = new Map<string, PlaywrightListedTest>();
    for (const fileSuite of toObjects(report.suites)) {
        visitSuite(fileSuite, []);
    }
    return [...tests.values()];

    function visitSuite(suite: Record<string, unknown>, titles: string[]): void {
        for (const spec of toObjects(suite.specs)) {
            if (typeof spec.file === 'string' && typeof spec.title === 'string') {
                addTest(spec.file, [...titles, spec.title]);
            }
        }
        for (const nested of toObjects(suite.suites)) {
            if (typeof nested.title === 'string') {
                visitSuite(nested, [...titles, nested.title]);
            }
        }
    }

    function addTest(location: string, title: string[]): void {
        const relative = relativePosixPath(realRoot, path.resolve(rootDir, location));
        if (relative.startsWith('../') || path.isAbsolute(relative)) {
            return;
        }
        const key = JSON.stringify([relative, title]);
        if (!tests.has(key)) {
            tests.set(key, { unit: { file: relative, title }, location });
        }
    }
}

/**
 * Formats tests as a Playwright `--test-list` file: one `file › describe › title` line each, the file
 * relative to `rootDir`, no project prefix (so every project runs them). Playwright trims each
 * `›`-separated token and matches the title path as a prefix, so a title it could not read back —
 * holding `›` or a line break, empty, or with surrounding whitespace — cuts the path there: the line
 * then selects more tests than asked, never fewer.
 * @__NO_SIDE_EFFECTS__
 */
export function formatPlaywrightTestList(tests: readonly PlaywrightListedTest[]): string {
    const lines = new Set<string>();
    for (const { unit, location } of tests) {
        if (!isListToken(location) || /:\d+$/.test(location) || /^[#[]/.test(location)) {
            throw new Error(`Playwright's --test-list cannot name the file "${location}".`);
        }
        const titles: string[] = [];
        for (const title of unit.title ?? []) {
            if (!isListToken(title)) {
                break;
            }
            titles.push(title);
        }
        lines.add([location, ...titles].join(' › '));
    }
    return lines.size === 0 ? '' : `${[...lines].join('\n')}\n`;
}

/** Whether Playwright reads `token` back unchanged from a `›`-separated test-list line. */
function isListToken(token: string): boolean {
    return token !== '' && token.trim() === token && !token.includes('›') && !/[\n\r]/.test(token);
}

function toObjects(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? value.filter(isPlainObject) : [];
}
