import { gmail } from '@googleapis/gmail';

import type { GoogleService } from '@nzyme/google-auth/GoogleService.js';
import { assert } from '@nzyme/utils/assert.js';

/** Gmail as a Google service: its scopes, and the account's address from its profile. */
export const gmailService: GoogleService = {
    name: 'GMAIL',
    scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.labels',
    ],
    async resolveEmail(auth, rootUrl) {
        const profile = await gmail({ version: 'v1', auth }).users.getProfile({ userId: 'me' }, { rootUrl });
        const email = profile.data.emailAddress;
        assert(email, 'The Gmail profile has no email address');
        return email;
    },
};
