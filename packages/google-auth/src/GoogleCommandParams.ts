import type { Injectable } from '@nzyme/ioc/Injectable.js';

import type { GoogleAuthShape } from './defineGoogleAuth.js';
import type { GoogleService } from './GoogleService.js';

/** What a CLI gives the shared Google commands. */
export interface GoogleCommandParams {
    /** The command path prefix, space-separated (`gmail`): the sign-in command is `<prefix> auth`. */
    prefix: string;
    service: GoogleService;
    /** The set's unit from `defineGoogleAuth`, created once per command set. */
    auth: Injectable<GoogleAuthShape>;
}
