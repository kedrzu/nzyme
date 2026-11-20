import { defineService } from '@nzyme/ioc/Service.js';

/**
 * Where Google is reached. Every field unset (the default) means Google's real URLs; tests override
 * the service with a local fake.
 */
export interface GoogleEndpoints {
    /** The OAuth token endpoint, used to exchange the sign-in code and to refresh. */
    oauthTokenUrl?: string;
    /** The OAuth consent page the sign-in URL points at. */
    oauthAuthUrl?: string;
    /** The API root a CLI passes to its API client. */
    apiRootUrl?: string;
}

/** The Google URLs in use; `{}` (Google's own) unless a test sets it. */
export const GoogleEndpoints = defineService<GoogleEndpoints>({
    name: 'GoogleEndpoints',
    setup: () => ({}),
});
