import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';

import type { StackDefinition } from '../defineStack.js';
import { matchStackName } from '../utils/matchStackName.js';

/**
 * Options for {@link filterStacks}.
 */
export interface FilterStacksOptions {
    /**
     * All known stacks to filter from.
     */
    stacks: StackDefinition[];

    /**
     * CLI patterns (globs and/or exact names) selecting which stacks to keep. Empty means all enabled
     * stacks.
     */
    stackNames: string[];

    /**
     * Logger used to warn about matched-but-disabled stacks.
     */
    logger: Logger;
}

/**
 * Select the stacks matching the given CLI patterns.
 *
 * Each pattern must match at least one stack, otherwise a {@link UsageError} is thrown. Disabled stacks
 * are warned about and excluded, but still count as a match so the pattern isn't reported as unmatched.
 */
export function filterStacks(options: FilterStacksOptions): Set<StackDefinition> {
    if (options.stackNames.length === 0) {
        return new Set(options.stacks.filter(s => s.enabled));
    }

    const stacks: Set<StackDefinition> = new Set();
    const matchedPatterns = new Set<string>();

    for (const pattern of options.stackNames) {
        for (const stack of options.stacks) {
            if (!matchStackName(pattern, stack.stackName)) {
                continue;
            }

            // Record the pattern as matched before the dedup check below. Otherwise a pattern that
            // resolves to a stack already added by an earlier pattern (e.g. a glob and an exact name
            // both resolving to the same stack) would be skipped by the dedup guard and wrongly
            // reported as unmatched.
            matchedPatterns.add(pattern);

            if (stacks.has(stack)) {
                continue;
            }

            if (!stack.enabled) {
                options.logger.warn(`Stack ${stack.stackName} is disabled.`);
                continue;
            }

            stacks.add(stack);
        }
    }

    // Check for patterns that didn't match any stack
    const unmatchedPatterns = options.stackNames.filter(p => !matchedPatterns.has(p));
    if (unmatchedPatterns.length > 0) {
        throw new UsageError(`Pattern(s) ${unmatchedPatterns.join(', ')} did not match any stacks.`);
    }

    return stacks;
}
