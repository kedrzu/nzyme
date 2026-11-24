import type { WebClient } from '@slack/web-api';

import { Command } from '@nzyme/cli-core/Command.js';
import type { Injectable } from '@nzyme/ioc/Injectable.js';

import { createSlackClient } from './createSlackClient.js';
import type { SlackAuthShape } from './defineSlackAuth.js';
import { resolveSlackFailure } from './slackExitCodes.js';
import type { SlackExitCode } from './slackExitCodes.js';

/**
 * Base class for every Slack command, and the single place where a recognised Slack failure — a
 * missing or revoked token, an unreachable API — turns into an exit code plus one actionable line on
 * stderr. Centralising the ritual, not just the mapping, means a change to how a failure surfaces is
 * one edit instead of the same edit in every command with one of them forgotten.
 */
export abstract class SlackCommand extends Command {
    /** The command set's unit from `defineSlackAuth`. */
    protected abstract readonly slackAuth: Injectable<SlackAuthShape>;

    override async run(): Promise<SlackExitCode> {
        try {
            return await this.runSlack();
        } catch (error) {
            const failure = resolveSlackFailure(error, this.container.resolve(this.slackAuth).options);
            if (!failure) {
                // Not a failure this mapping recognises — rethrow, so the base `Command.catch()`
                // reports it as the genuine bug it is, stack trace included.
                throw error;
            }

            this.context.stderr.write(`${failure.message}\n`);
            return failure.exitCode;
        }
    }

    /**
     * The command's own work. Anything it throws that `resolveSlackFailure` recognises is reported by
     * {@link SlackCommand.run}, so no command handles a Slack transport failure itself.
     */
    protected abstract runSlack(): Promise<SlackExitCode>;

    /** A client acting as the developer, on a token fresh for this call. */
    protected createClient(): Promise<WebClient> {
        return createSlackClient(this.container.resolve(this.slackAuth));
    }

    /**
     * Parses the `--limit` option shared by `channels`, `people`, `read` and `search`, printing the
     * one rejection message all four use — so a bad value is refused identically everywhere, and a
     * Slack-imposed cap would have a single place to live. Returns `undefined` when the value is not
     * a positive integer; the caller reports that as `INVALID_ARGUMENTS`.
     */
    protected parseLimit(value: string): number | undefined {
        const limit = Number.parseInt(value, 10);
        if (!Number.isFinite(limit) || limit <= 0) {
            this.context.stderr.write(`Invalid --limit: "${value}" (expected a positive integer)\n`);
            return undefined;
        }

        return limit;
    }
}
