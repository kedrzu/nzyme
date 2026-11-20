import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

import type { OAuth2Client } from 'google-auth-library';
import { CodeChallengeMethod } from 'google-auth-library';

import type { GoogleToken } from './googleTokenKey.js';
import type { GoogleService } from './GoogleService.js';

const TIMEOUT_MS = 5 * 60 * 1000;

/** Options of {@link signInGoogle}. */
export interface SignInGoogleParams {
    /** The project's OAuth client, without credentials. It must be a Desktop-app client. */
    client: OAuth2Client;
    service: GoogleService;
    /** Passed to `service.resolveEmail`. */
    apiRootUrl: string | undefined;
    /** The account to preselect on Google's account chooser. */
    loginHint?: string;
    /** Whether to try opening the sign-in URL in the default browser. */
    openBrowser: boolean;
    /** Shows a line to the person signing in (the sign-in URL among them). */
    print(line: string): void;
}

/**
 * Signs an account in with the installed-app OAuth flow: a loopback redirect on 127.0.0.1 and PKCE.
 * A Desktop-app client accepts any `http://127.0.0.1:<port>` redirect, so nothing stays running.
 * Requires a refresh token and every scope of the service. Errors never carry a credential.
 */
export async function signInGoogle(params: SignInGoogleParams): Promise<GoogleToken> {
    const { client, service } = params;
    const state = randomBytes(16).toString('hex');
    const callback = Promise.withResolvers<string>();
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();

    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: request => answerRedirect(new URL(request.url)),
    });
    const redirectUri = `http://127.0.0.1:${server.port}/`;
    let code: string;
    try {
        code = await waitForCode();
    } finally {
        await server.stop();
    }

    const tokens = await exchangeCode(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
        throw new Error(
            "Google returned no refresh token. Remove the app's access at https://myaccount.google.com/permissions and sign in again.",
        );
    }

    const granted = (tokens.scope ?? '').split(' ');
    const missing = service.scopes.filter(scope => !granted.includes(scope));
    if (missing.length > 0) {
        throw new Error(
            `Not every permission was granted (missing: ${missing.join(', ')}). ` +
                'Sign in again and tick every checkbox on the consent screen.',
        );
    }

    client.setCredentials(tokens);
    // Errors keep only their message here: an HTTP client's error carries the request, credentials included.
    const email = await service.resolveEmail(client, params.apiRootUrl).catch((error: unknown) => {
        throw new Error(`Signed in, but the account's address could not be read: ${errorMessage(error)}`);
    });

    return { email, refreshToken, scopes: granted };

    async function waitForCode() {
        const url = client.generateAuthUrl({
            access_type: 'offline',
            // Always returns a refresh token, also on a repeated sign-in.
            prompt: 'consent',
            scope: service.scopes,
            state,
            login_hint: params.loginHint,
            redirect_uri: redirectUri,
            code_challenge: codeChallenge,
            code_challenge_method: CodeChallengeMethod.S256,
        });

        params.print(`Sign in with Google in the browser. If it did not open, visit:\n${url}`);
        if (params.openBrowser) {
            openInBrowser(url);
        }

        const timer = setTimeout(
            () => callback.reject(new Error('Timed out after 5 minutes waiting for the Google sign-in.')),
            TIMEOUT_MS,
        );
        try {
            return await callback.promise;
        } finally {
            clearTimeout(timer);
        }
    }

    function answerRedirect(requestUrl: URL) {
        if (requestUrl.pathname !== '/') {
            return new Response(null, { status: 404, headers: { connection: 'close' } });
        }

        const error = requestUrl.searchParams.get('error');
        const received = requestUrl.searchParams.get('code');
        if (requestUrl.searchParams.get('state') !== state || (!received && !error)) {
            return page({ status: 400, title: 'Unexpected request', body: 'This is not the sign-in that is waiting.' });
        }

        if (!received) {
            callback.reject(new Error(`Google sign-in failed: ${error}`));
            return page({
                status: 200,
                title: 'Sign-in cancelled',
                body: `Google answered: ${error}. You can close this tab.`,
            });
        }

        callback.resolve(received);
        return page({ status: 200, title: 'Signed in', body: 'Access is granted. You can close this tab.' });
    }

    async function exchangeCode(received: string) {
        const response = await client
            .getToken({ code: received, codeVerifier, redirect_uri: redirectUri })
            .catch((error: unknown) => {
                throw new Error(`Google refused the sign-in code: ${errorMessage(error)}`);
            });
        return response.tokens;
    }
}

function openInBrowser(url: string) {
    const [command, args]: [string, string[]] =
        process.platform === 'darwin'
            ? ['open', [url]]
            : process.platform === 'win32'
              ? ['cmd', ['/c', 'start', '""', url]]
              : ['xdg-open', [url]];
    try {
        spawn(command, args, { stdio: 'ignore', detached: true })
            .on('error', () => {})
            .unref();
    } catch {
        // No browser here: the URL is printed anyway.
    }
}

/** The browser page answering the sign-in redirect. */
export interface PageParams {
    status: number;
    title: string;
    body: string;
}

function page({ status, title, body }: PageParams) {
    const html =
        `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
        `<body style="font-family:system-ui;max-width:32rem;margin:4rem auto"><h1>${title}</h1><p>${body}</p></body>`;
    // `connection: close`, so the browser keeps no connection that would hold the server's graceful stop.
    return new Response(html, { status, headers: { 'content-type': 'text/html', connection: 'close' } });
}

/** Only the message: an HTTP client's error object carries the request, credentials included. */
function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
