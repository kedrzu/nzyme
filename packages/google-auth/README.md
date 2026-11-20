# @nzyme/google-auth

Google sign-in shared by the nzyme Google CLIs ([`@nzyme/gmail-cli`](../gmail-cli),
[`@nzyme/gdrive-cli`](../gdrive-cli)): the OAuth client read from a `SecretsProvider`, the browser sign-in,
refresh tokens kept in the secret stores, and the `auth` and `accounts` commands. Most repos never import
it: they configure it through the `auth` option of `defineGmailCommands` or `defineDriveCommands`.

Why it works this way: `docs/decisions/google-clis-on-official-sdks-with-tokens-in-secret-stores.md`.

## Installation

It is a dependency of the two CLIs. Install it directly only to build another Google CLI on it.

```bash
bun add @nzyme/google-auth
```

## Options

`GoogleAuthOptions` is the `auth` option of each Google CLI. One command set uses one OAuth client; a
repo needing two registers two sets with different `prefix` and `keyPrefix`.

|Option|Default|Meaning|
|-|-|-|
|`provider`|required|The project's service resolving to a `SecretsProvider` (`@nzyme/secrets`)|
|`clientIdKey`|`GOOGLE_CLIENT_ID`|Key of the OAuth client id|
|`clientSecretKey`|`GOOGLE_CLIENT_SECRET`|Key of the OAuth client secret|
|`keyPrefix`|`GOOGLE_`|Prefix of the token keys|
|`accounts`|every signed-in one|Emails or `*` globs (case-insensitive) the project may use; an empty list allows none; others are visible but untouchable|

## Token storage

Each account's refresh token is a secret under `<keyPrefix><SERVICE>_TOKEN_<SLUG>` (default prefix
`GOOGLE_`, service `GMAIL` or `DRIVE`; `SLUG` is the email upper-cased, every non-alphanumeric character
turned into `_`, so `ann@acme.com` for Gmail is `GOOGLE_GMAIL_TOKEN_ANN_ACME_COM`). The value is JSON
(email, refresh token, granted scopes, sign-in time).

The `provider` is a `SecretsProvider` of `@nzyme/secrets`: the client id, the client secret and the tokens
are read from its `stores`, and a token is written through its `target(key)`. Two requirements on it:

- `target` must accept keys of this pattern (a repo whose `target` allows only some names must allow
  these), and the client keys must be present in a store (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` by
  default).
- `target(key)` must return the same store instance that is listed in `stores`. A `cached` store keeps its
  `readAll` in the OS keychain until its TTL expires: a fresh instance returned by `target` writes to the
  same place but leaves the cached copy stale, so the new sign-in stays hidden until the TTL runs out.

Access tokens are never stored: each command refreshes once. A refresh token Google rotates is written
back through `target`.

## Signing in

`<prefix> auth` (for example `gmail auth`) opens Google's consent page, waits for the redirect on a
loopback port and writes the token. **The user runs it, not the agent:** it needs a person at a browser.
`--no-browser` only prints the URL (it goes to stderr either way); `--login-hint <email>` preselects the
account and `--port <n>` fixes the redirect port. `<prefix> accounts` lists the signed-in accounts and
their granted scopes, marking one the project's `accounts` option excludes as `not allowed`.

Users sign in once per service and account; the token serves every project that can reach the same store.

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
5. Store the two values from it as secrets, with the masked prompt of `secrets`:

   ```bash
   bun nzyme secrets set GOOGLE_CLIENT_ID --prompt="Google OAuth client id: Cloud console > Google Auth Platform > Clients"
   bun nzyme secrets set GOOGLE_CLIENT_SECRET --prompt="Google OAuth client secret: same page"
   ```

   Use the product CLI's name instead of `bun nzyme` where the repo has one.

|Message|Cause|Fix|
|-|-|-|
|`org_internal`|Internal app, account outside the Workspace|Use a client of the account's own organisation|
|`access_denied` on an External app in Testing|Address not among the test users|Add it under *Audience > Test users*, or publish|
|`redirect_uri_mismatch`|A Web client instead of a Desktop one|Create a Desktop client|
|`invalid_grant` on a later command|Token expired (Testing: 7 days), revoked or password changed|Run `auth` again|
|`invalid_client`|Client deleted or its secret rotated|Update the two client secrets|
|The admin blocks the app|Workspace restricts third-party apps|Admin console > *Security > API controls*: trust it|
