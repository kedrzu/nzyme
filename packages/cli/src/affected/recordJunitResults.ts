import path from 'node:path';

import { readJunitResults } from '@nzyme/affected/junit/readJunitResults.js';
import type { JunitFileResult } from '@nzyme/affected/junit/readJunitResults.js';
import type { RecordRefusal, TestSelector } from '@nzyme/affected/selector/openTestSelector.js';
import { relativePosixPath } from '@nzyme/project-utils/relativePosixPath.js';

/** Options of {@link recordJunitResults}. */
export interface RecordJunitResultsOptions {
    selector: TestSelector;
    /** Top of the git working tree. */
    root: string;
    /** The JUnit report the run wrote. */
    junitFile: string;
    /** Root-relative test files the command ran. */
    ranFiles: readonly string[];
}

/** What {@link recordJunitResults} did with each test file the command ran. */
export interface JunitRecording {
    recorded: string[];
    refused: { file: string; reason: RecordRefusal }[];
    /** Failed files: recorded nothing, so they run again. */
    failed: string[];
    /**
     * Ran, but in the report with a testcase skipped (a name-filtered run covers only part of a file),
     * or not at all (a file that failed to load).
     */
    unreported: string[];
}

/**
 * Records, per test file, the outcome of a run from its JUnit report: a file all of whose testcases
 * passed gets a variant (its entry is the file itself; imports are followed); a file with any failure,
 * or one the report does not show passing in full (a testcase skipped, or not reported at all), gets
 * none. Nothing is invalidated: the command ran only files no variant matched, so a failed one has no
 * matching variant to remove and runs again as it is. Throws when the report cannot be read.
 *
 * Report paths are absolute or relative to the runner's root, which need not be the git root
 * (vitest's `root`): one is matched to a ran file exactly, else by path suffix when that is unique.
 */
export async function recordJunitResults(options: RecordJunitResultsOptions): Promise<JunitRecording> {
    const { selector, root } = options;
    const results = await readJunitResults(options.junitFile);
    const statuses = matchRanFiles(results, options.ranFiles, root);
    const recording: JunitRecording = { recorded: [], refused: [], failed: [], unreported: [] };

    for (const file of options.ranFiles) {
        const status = statuses.get(file);
        if (status === 'failed') {
            recording.failed.push(file);
        } else if (status === 'passed') {
            const result = await selector.record({ file }, { status: 'passed', entry: [file] });
            if (result.recorded) {
                recording.recorded.push(file);
            } else {
                recording.refused.push({ file, reason: result.reason });
            }
        } else {
            recording.unreported.push(file);
        }
    }

    return recording;
}

/**
 * Maps each ran file to its outcome in the report: a failure wins over anything else reported for it,
 * and a skip over a pass.
 */
function matchRanFiles(
    results: readonly JunitFileResult[],
    ranFiles: readonly string[],
    root: string,
): Map<string, JunitFileResult['status']> {
    const ran = new Set(ranFiles);
    const statuses = new Map<string, JunitFileResult['status']>();

    for (const result of results) {
        const file = matchRanFile(result.file);
        if (file === undefined) {
            continue;
        }
        const current = statuses.get(file);
        if (current === undefined || current === 'passed' || result.status === 'failed') {
            statuses.set(file, result.status);
        }
    }
    return statuses;

    function matchRanFile(reported: string): string | undefined {
        const posix = reported.split(path.sep).join('/');
        if (path.isAbsolute(reported)) {
            const relative = relativePosixPath(root, reported);
            if (ran.has(relative)) {
                return relative;
            }
            // The root reached through another path (a symlinked temp dir): the longest ran file it ends with.
            return ranFiles
                .filter(file => posix.endsWith(`/${file}`))
                .toSorted((a, b) => b.length - a.length)
                .at(0);
        }

        const relative = posix.replace(/^\.\//, '');
        if (ran.has(relative)) {
            return relative;
        }
        const candidates = ranFiles.filter(file => file.endsWith(`/${relative}`));
        return candidates.length === 1 ? candidates[0] : undefined;
    }
}
