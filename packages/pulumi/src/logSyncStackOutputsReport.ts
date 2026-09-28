import chalk from 'chalk';

import type { SyncStackOutputsReport } from './syncStackOutputs.js';

/**
 * Logs a {@link SyncStackOutputsReport} through each affected stack's logger — one line per stack, naming
 * it and, for a failure, the error that caused it. The report holds no output values, and only stack
 * names and errors are passed to the logger, so nothing here risks logging a secret.
 *
 * Returns whether any stack failed to sync (a fetch failure or a hook failure), so the caller can pick a
 * process exit code without re-deriving that condition itself.
 */
export function logSyncStackOutputsReport(report: SyncStackOutputsReport): boolean {
    for (const stack of report.missing) {
        stack.logger.warn(`⚠️  Stack ${chalk.yellow(stack.name)} is not deployed, skipping.`);
    }

    for (const { stack, error } of report.fetchFailures) {
        stack.logger.error(`❌ Failed to fetch outputs of stack ${chalk.red(stack.name)}.`, { error });
    }

    for (const { stack, error } of report.hookFailures) {
        stack.logger.error(`❌ The outputs hook of stack ${chalk.red(stack.name)} failed.`, { error });
    }

    for (const stack of report.synced) {
        stack.logger.info(`✅ Synced outputs of stack ${chalk.green(stack.name)}`);
    }

    return report.fetchFailures.length > 0 || report.hookFailures.length > 0;
}
