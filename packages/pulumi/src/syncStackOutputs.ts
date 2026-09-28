import { forEachParalell } from '@nzyme/utils/array/forEachParalell.js';

import type { Stack } from './defineStack.js';

/**
 * How many stacks' outputs are fetched from the backend at once — each fetch spawns Pulumi CLI processes.
 */
const FETCH_CONCURRENCY = 5;

/**
 * Options for the {@link syncStackOutputs} function.
 */
export interface SyncStackOutputsOptions {
    /**
     * Stacks to sync, in the order their `outputs` hooks should run (dependencies first).
     */
    stacks: Stack[];

    /**
     * Fetches a stack's currently deployed outputs, or `null` when the backend has no such stack. Must
     * never create a stack.
     */
    fetchOutputs: (stack: Stack) => Promise<Record<string, unknown> | null>;
}

/**
 * A stack that could not be synced, with the reason.
 */
export interface StackOutputsFailure {
    /** The stack that failed. */
    stack: Stack;
    /** The error that caused the failure. */
    error: unknown;
}

/**
 * Outcome of {@link syncStackOutputs}, per stack. Holds no output values, so it is safe to log.
 */
export interface SyncStackOutputsReport {
    /** Stacks whose `outputs` hook ran successfully. */
    synced: Stack[];
    /** Stacks the backend does not have (never deployed) — skipped, not an error. */
    missing: Stack[];
    /** Stacks whose deployed outputs could not be fetched — their `outputs` hook did not run. */
    fetchFailures: StackOutputsFailure[];
    /** Stacks whose `outputs` hook threw. */
    hookFailures: StackOutputsFailure[];
}

/**
 * Materializes local config from already-deployed stacks by running ONLY their `outputs` hooks with the
 * currently deployed outputs — no build, no deploy hooks, no stack creation. One failing stack does not
 * stop the rest; every failure is collected in the report instead.
 *
 * Outputs are fetched in parallel (bounded), hooks run one at a time in stack order, since they may
 * read-modify-write the same local file.
 */
export async function syncStackOutputs(options: SyncStackOutputsOptions): Promise<SyncStackOutputsReport> {
    const report: SyncStackOutputsReport = {
        synced: [],
        missing: [],
        fetchFailures: [],
        hookFailures: [],
    };

    const outputsByStack = new Map<Stack, Record<string, unknown>>();

    await forEachParalell(options.stacks, {
        concurrency: FETCH_CONCURRENCY,
        callback: async stack => {
            try {
                const output = await options.fetchOutputs(stack);
                if (output) {
                    outputsByStack.set(stack, output);
                } else {
                    report.missing.push(stack);
                }
            } catch (error) {
                report.fetchFailures.push({ stack, error });
            }
        },
    });

    for (const stack of options.stacks) {
        const output = outputsByStack.get(stack);
        if (!output) {
            continue;
        }

        try {
            await stack.outputs(output);
            report.synced.push(stack);
        } catch (error) {
            report.hookFailures.push({ stack, error });
        }
    }

    return report;
}
