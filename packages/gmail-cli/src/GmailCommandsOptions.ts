import type { GoogleAuthOptions } from '@nzyme/google-auth/GoogleAuthOptions.js';
import type { GoogleCommandParams } from '@nzyme/google-auth/GoogleCommandParams.js';

import type { QuoteAttributionOptions } from './compose.js';
import type { GmailLabelRules } from './labelRules.js';

/** Local files the Gmail commands read and write. Every path is absolute or starts with `~`. */
export interface GmailFilesOptions {
    /** Directories, besides the project's, that draft attachments may be read from. */
    roots?: string[];
    /** Where `attachment save` writes, one directory per message. Default `<tmpdir>/gmail-cli/attachments`. */
    attachmentsDir?: string;
}

/** Options of {@link defineGmailCommands}. */
export interface GmailCommandsOptions {
    /** The command path prefix, space-separated. Default `gmail`. */
    prefix?: string;
    /** The OAuth client, the secret stores holding the tokens, and the accounts the project may use. */
    auth: GoogleAuthOptions;
    /** The project's label rules and named search views. */
    labels?: GmailLabelRules;
    files?: GmailFilesOptions;
    /** How the attribution line of a reply quote is written. */
    reply?: QuoteAttributionOptions;
}

/** What every Gmail command is defined with: the Google sign-in params plus the Gmail options. */
export interface GmailCommandParams extends GoogleCommandParams {
    labels?: GmailLabelRules;
    files?: GmailFilesOptions;
    reply?: QuoteAttributionOptions;
}
