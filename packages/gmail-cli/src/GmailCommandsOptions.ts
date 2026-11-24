import type { GoogleAuthOptions } from '@nzyme/google-auth/GoogleAuthOptions.js';
import type { GoogleCommandParams } from '@nzyme/google-auth/GoogleCommandParams.js';

import type { QuoteAttributionOptions } from './compose.js';
import type { GmailLabelRules } from './labelRules.js';

/** Options of {@link defineGmailCommands}. */
export interface GmailCommandsOptions {
    /** The command path prefix, space-separated. Default `gmail`. */
    prefix?: string;
    /**
     * The secrets provider, the declared token secret, the OAuth client provider, and the accounts the
     * project may use.
     */
    auth: GoogleAuthOptions;
    /** The project's label rules and named search views. */
    labels?: GmailLabelRules;
    /** How the attribution line of a reply quote is written. */
    reply?: QuoteAttributionOptions;
}

/** What every Gmail command is defined with: the Google sign-in params plus the Gmail options. */
export interface GmailCommandParams extends GoogleCommandParams {
    /** The project's label rules and named search views. */
    labels?: GmailLabelRules;
    /** How the attribution line of a reply quote is written. */
    reply?: QuoteAttributionOptions;
}
