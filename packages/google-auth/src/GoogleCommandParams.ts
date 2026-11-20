import type { GoogleAuthOptions } from './GoogleAuthOptions.js';
import type { GoogleService } from './GoogleService.js';

/** What a CLI gives the shared Google commands and `GoogleAccounts`. */
export interface GoogleCommandParams {
    /** The command path prefix, space-separated (`gmail`): the sign-in command is `<prefix> auth`. */
    prefix: string;
    service: GoogleService;
    options: GoogleAuthOptions;
}
