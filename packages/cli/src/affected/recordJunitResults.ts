import path from 'node:path';

import type { FsTrace } from '@nzyme/affected/fsTrace/readFsTrace.js';
import { mergeJunitStatus, readJunitResults } from '@nzyme/affected/junit/readJunitResults.js';
import type { JunitFileResult } from '@nzyme/affected/junit/readJunitResults.js';
import type { FsAccesses, FsReads, RecordRefusal, TestSelector } from '@nzyme/affected/selector/openTestSelector.js';
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
    /** The run's file accesses (`readFsTrace`), or `null` when the run was not traced. */
    fsTrace: FsTrace | null;
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
 * none. A traced run (`fsTrace`) adds what each file read — a file it shows nothing for read nothing
 * but its snapshot file, which `bun test` reads natively, out of the trace's sight — and what the
 * modules it may load read anywhere in the run.
 * Nothing is invalidated: the command ran only files no variant matched, so a failed one has no
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
            const fsReads = options.fsTrace ? toFsReads(file, options.fsTrace) : undefined;
            const result = await selector.record({ file }, { status: 'passed', entry: [file], fsReads });
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
 * A traced test file's reads: its own (none when the trace shows nothing for it) plus its snapshot
 * file (`__snapshots__/<file>.snap`), which `toMatchSnapshot` reads without going through `node:fs` —
 * one that does not exist is not a walked file, so the variant leaves it out — and the run's shared
 * ones.
 */
function toFsReads(file: string, trace: FsTrace): FsReads {
    const own: FsAccesses = trace.tests.get(file) ?? { files: [], dirs: [], trees: [], opaque: false };
    const snapshot = path.posix.join(path.posix.dirname(file), '__snapshots__', `${path.posix.basename(file)}.snap`);
    return { ...own, files: [...new Set([...own.files, snapshot])].toSorted(), shared: trace.shared };
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
        statuses.set(file, mergeJunitStatus(statuses.get(file), result.status));
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
