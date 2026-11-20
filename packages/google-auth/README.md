# @nzyme/google-auth

Google sign-in shared by the nzyme Google CLIs ([`@nzyme/gmail-cli`](../gmail-cli),
[`@nzyme/gdrive-cli`](../gdrive-cli)): the browser sign-in, refresh tokens kept in a declared
secret, the product's `GoogleClientProvider` for the OAuth client, and the `auth` and `accounts` commands. Most repos never import
it: they configure it through the `auth` option of `defineGmailCommands` or `defineDriveCommands`.

Why it works this way: `docs/decisions/google-clis-on-official-sdks-with-tokens-in-secret-stores.md`.

## Installation

It is a dependency of the two CLIs. Install it directly only to build another Google CLI on it.

```bash
bun add @nzyme/google-auth
```

## Options

`GoogleAuthOptions` is the `auth` option of each Google CLI. Each command set keeps its accounts in one
token secret, so a repo registering two sets (different `prefix`) declares two token secrets.

|Option|Default|Meaning|
|-|-|-|
|`provider`|required|The product's service resolving to a `SecretsProvider` (`@nzyme/secrets`)|
|`tokens`|required|The `defineSecret` declaration holding every signed-in account of the service (`GMAIL_TOKENS`, `GDRIVE_TOKENS`)|
|`client`|required|The product's service implementing `GoogleClientProvider`: the OAuth client of an account|
|`accounts`|every signed-in one|Emails or `*` globs (case-insensitive) the project may use; an empty list allows none; others are visible but untouchable|

```ts
// packages/secrets/src/secrets.ts
export const GMAIL_TOKENS = defineSecret('GMAIL_TOKENS', {
    description: 'Gmail refresh tokens by account, written by `gmail auth`',
    meta: { store: 'personal' },
});
```

```ts
auth: { provider: AppSecrets, tokens: GMAIL_TOKENS, client: AppGoogleClients, accounts: ['*@example.com'] },
```

`google-auth` is plain functions and holds no client of its own: the product's `GoogleClientProvider`
decides which OAuth client serves which account, so one repo can use several Google Cloud projects.

## Token storage

Each service keeps all its accounts in the one declared secret `tokens`. Its value is a JSON object keyed
by the lower-cased email, each entry the refresh token and the granted scopes:

```json
{ "ann@example.com": { "refreshToken": "1//0g…", "scopes": ["https://www.googleapis.com/auth/gmail.modify"] } }
```

The secret is read from the `provider`'s `stores` and written by `auth` through
`resolveSecretTarget` of `@nzyme/secrets`, the same declaration-checked path as `secrets set`. Before the
browser opens, `auth` refuses a token secret that is not declared or not enabled here, a store `target`
refuses, and a value that is not the dictionary. Requirements:

- `target(<token secret>)` must return the store that is listed in `stores`. A `cached` store keeps its
  `readAll` in the OS keychain until its TTL expires: a fresh instance writes to the same place but
  leaves the cached copy stale, so the new sign-in stays hidden until the TTL runs out.
- **Route the token secret to a per-developer store** (`meta.store: 'personal'`, the keychain), never the
  shared team store. A refresh token is the mailbox or the Drive of its owner: whoever reads the shared
  store could act as every account that signed in.

Access tokens are never stored: each command refreshes once.

## Signing in

`<prefix> auth` (for example `gmail auth`) opens Google's consent page, waits for the redirect on a
loopback port and writes the token. **The user runs it, not the agent:** it needs a person at a browser.
`--no-browser` only prints the URL (it goes to stderr either way); `--login-hint <email>` preselects the
account. `<prefix> accounts` lists the signed-in accounts and their granted scopes, marking one the
project's `accounts` option excludes as `not allowed`.

Other commands take `--account <email>`. One usable account needs no flag; with several, a command without
it fails and lists them.

Users sign in once per service and account; the token serves every project that reads the same store.

## The Google Cloud app

Sign-in goes through an OAuth client that belongs to a Google Cloud project. One client serves any number
of accounts and projects.

1. In the [Cloud console](https://console.cloud.google.com), create a project. For a company, create it
   under the Workspace organisation.

2. In *APIs & Services > Library*, enable the **Gmail API** and the **Google Drive API**, whichever CLIs
   you use.

3. In *Google Auth Platform*, set the app name and support email and choose the audience:
   - **Internal**, offered to Workspace organisations: only accounts of that Workspace can sign in,
     nothing needs verifying and tokens do not expire. Use it for company accounts.
   - **External**: for `@gmail.com` and other outside accounts. An app in **Testing** status allows only
     the listed test users (max 100), and **its refresh tokens expire after 7 days**. For lasting access
     choose *Audience > Publish app*: the Gmail and Drive scopes are restricted, so Google does not verify
     the app for public use, but an unverified app in production works for its owner (the consent screen
     says "Google hasn't verified this app": *Advanced > Go to the app*).

4. In *Clients*, create a client of type **Desktop app** and download its JSON. A Desktop client needs no
   redirect URI.

5. Declare the two keys with `defineSecret` in the product's secrets package (see the `secrets` README),
   or `secrets set` refuses them in a project that declares its secrets:

   ```ts
   export const GOOGLE_CLIENT_ID = defineSecret('GOOGLE_CLIENT_ID', { description: 'Google OAuth client id' });
   export const GOOGLE_CLIENT_SECRET = defineSecret('GOOGLE_CLIENT_SECRET', { description: 'Google OAuth client secret' });
   ```

   The product's own `GoogleClientProvider` reads them; nothing in `google-auth` fixes their names:

   ```ts
   import type { GoogleClientProvider } from '@nzyme/google-auth/GoogleClientProvider.js';
   import { defineService } from '@nzyme/ioc/Service.js';

   import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '@acme/secrets/secrets.js';

   export const AppGoogleClients = defineService({
       name: 'AppGoogleClients',
       deps: { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET },
       setup: ({ clientId, clientSecret }): GoogleClientProvider => ({
           async getClient() {
               return { clientId, clientSecret };
           },
       }),
   });
   ```

   `email` is the account being refreshed, or unset for a sign-in without `--login-hint`; return a
   different client per domain if the repo has several Google Cloud projects. The stored token does not
   record its client, so a refresh must get the one the account signed in with. Resolving
   `GOOGLE_CLIENT_ID` through `deps` needs the CLI to have loaded its secrets with `loadSecretsConfig`
   (`@nzyme/secrets`) at startup.

6. Store the two values from the client JSON, with the masked prompt of `secrets`:

   ```bash
   bun secrets set GOOGLE_CLIENT_ID --prompt="Google OAuth client id: Cloud console > Google Auth Platform > Clients"
   bun secrets set GOOGLE_CLIENT_SECRET --prompt="Google OAuth client secret: same page"
   ```

7. Declare the token secret of each CLI (`GMAIL_TOKENS`, `GDRIVE_TOKENS`, [above](#options)). `auth`
   writes it itself through `resolveSecretTarget`, so no `secrets set` is needed.

|Message|Cause|Fix|
|-|-|-|
|`org_internal`|Internal app, account outside the Workspace|Use a client of the account's own organisation|
|`access_denied` on an External app in Testing|Address not among the test users|Add it under *Audience > Test users*, or publish|
|`redirect_uri_mismatch`|A Web client instead of a Desktop one|Create a Desktop client|
|`invalid_grant` on a later command|Token expired (Testing: 7 days), revoked or password changed|Run `auth` again|
|`invalid_client`|Client deleted, its secret rotated, or the account signed in with another client|Update the client secrets, or make `getClient` return the client the account signed in with|
|The admin blocks the app|Workspace restricts third-party apps|Admin console > *Security > API controls*: trust it|
