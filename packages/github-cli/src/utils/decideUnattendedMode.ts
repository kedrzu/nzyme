/**
 * Inputs to {@link decideUnattendedMode}.
 */
export interface DecideUnattendedModeParams {
    /**
     * Nobody is there to answer for reasons upstream of the terminal — e.g. an agent picked up a
     * Linear issue that was explicitly delegated to it, rather than a human driving the command.
     */
    delegated: boolean;

    /**
     * The caller passed `--yes`/`-y`, asking the command not to prompt even though a terminal
     * might be attached.
     */
    yes: boolean;

    /**
     * Whether a terminal is actually attached to answer a prompt (`process.stdin.isTTY`).
     */
    isTty: boolean;
}

/**
 * Decide whether a command should run without asking any questions.
 *
 * Before this function existed, the CLI computed "nobody is there to answer" three different
 * ways: `switchToTask` derived it from Linear delegation, `pushChanges` hardcoded `autoYes: true`
 * regardless of the caller, and `syncAllRepos` had no notion of it at all — which is exactly why
 * it could auto-commit a dirty submodule unconditionally. Three definitions of the same flag in
 * one CLI is a defect, not a design choice: whichever one a given call site forgot to update
 * silently drifts from the others. This function is the single place that combines the three real
 * reasons unattended mode is true, so every caller reasons about interactivity the same way.
 * @param params The three independent signals that each, alone, mean nobody can be asked.
 * @returns `true` if the command must not prompt.
 * @__NO_SIDE_EFFECTS__
 */
export function decideUnattendedMode(params: DecideUnattendedModeParams): boolean {
    const { delegated, yes, isTty } = params;

    return delegated || yes || !isTty;
}
