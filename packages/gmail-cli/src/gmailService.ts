import { gmail } from '@googleapis/gmail';

import type { GoogleService } from '@nzyme/google-auth/GoogleService.js';
import { assert } from '@nzyme/utils/assert.js';
import { immutable } from '@nzyme/utils/immutable.js';

/** Gmail as a Google service: its scopes, and the account's address from its profile. */
export const gmailService: GoogleService = immutable<GoogleService>({
    name: 'GMAIL',
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    async resolveEmail(auth, rootUrl) {
        const profile = await gmail({ version: 'v1', auth }).users.getProfile({ userId: 'me' }, { rootUrl });
        const email = profile.data.emailAddress;
        assert(email, 'The Gmail profile has no email address');
        return email;
    },
});
