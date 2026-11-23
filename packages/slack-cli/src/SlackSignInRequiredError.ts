import { ApplicationError } from '@nzyme/logging/ApplicationError.js';

/**
 * The developer has to sign in to Slack again: no sign-in is stored, or Slack refused to refresh it.
 * Its message says so in one line, naming the sign-in command, so every caller can print it as it is.
 */
export class SlackSignInRequiredError extends ApplicationError {
    /** Builds `<reason> — run `<signInCommand>`, then retry`. */
    constructor(reason: string, signInCommand: string) {
        super(`${reason} — run \`${signInCommand}\`, then retry`, {});
        this.name = 'SlackSignInRequiredError';
    }
}
