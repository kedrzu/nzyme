import { drive } from '@googleapis/drive';

import type { GoogleService } from '@nzyme/google-auth/GoogleService.js';
import { assert } from '@nzyme/utils/assert.js';
import { immutable } from '@nzyme/utils/immutable.js';

/** Google Drive as a Google service: its scope, and the account's address from `about`. */
export const driveService: GoogleService = immutable<GoogleService>({
    name: 'DRIVE',
    // The full scope: one token serves every project, and the permission switches narrow it per project.
    scopes: ['https://www.googleapis.com/auth/drive'],
    async resolveEmail(auth, rootUrl) {
        const about = await drive({ version: 'v3', auth }).about.get({ fields: 'user(emailAddress)' }, { rootUrl });
        const email = about.data.user?.emailAddress;
        assert(email, 'Google Drive reported no email address for the account');
        return email;
    },
});
