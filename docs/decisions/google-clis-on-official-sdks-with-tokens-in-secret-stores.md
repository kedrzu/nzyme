# Google CLIs on the official SDKs, with OAuth tokens in secret stores

## Status

Accepted

## Context

`gmail-cli` and `gdrive-cli` replace two hand-written MCP servers (`gmail-mcp`, `gdrive-mcp`). An MCP
server loads every tool schema into the agent's context in every session; a CLI command costs nothing
until it is called. The servers also kept state the framework already has a place for: refresh tokens in
files under `~/.claude/<server>/tokens/`, and the OAuth client and account rules in JSON files in
`.claude/*-mcp.json`.

Two questions came up with the port, which covers about twenty endpoints, media upload of MIME messages
and files, and the OAuth sign-in.

**1. How to call Google.** `docs/practice/api-clients.md` models endpoints by hand over
`@nzyme/fetch-utils` and lets an official SDK in only "for what is costly to rebuild".

> **Checked 2026-11-20:** a global `rootUrl` set on the client is ignored for media uploads in
> `googleapis-common`; only a per-call `rootUrl` option reaches them. `OAuth2Client` takes the token
> endpoint from `endpoints.oauth2TokenUrl`.

**2. Where the credentials live.** The OAuth client id and secret, and one refresh token per account and
service, are credentials. `docs/decisions/secrets-as-code-through-env-variables.md` makes the project's
`SecretStore` the one home of every credential.

## Options Considered

How to call Google:

- **Hand-modelled `@nzyme/fetch-utils` endpoints**, as the practice document prescribes. Trade-off:
  the surface is exactly what the CLIs use, so send and delete cannot be called at all; but the MIME and
  resumable media upload, the Docs and Sheets export and the OAuth refresh and rotation all have to be
  rebuilt and kept faithful to the servers being replaced.
- **Official `@googleapis/gmail`, `@googleapis/drive` and `google-auth-library`.** Trade-off: heavier
  dependencies, and the SDK object can technically call send and delete; in exchange media upload, export,
  paging and token refresh are the maintained implementation.

Where the credentials live:

- **A token directory on disk**, as the servers did. Trade-off: a second home for credentials beside
  the secrets, no shared way to swap the store, and configuration in JSON beside the code.
- **The OS keychain only.** Trade-off: no sharing between machines, and it bypasses the project's store
  policy (`target`).
- **The project's `SecretStore`, through its `SecretsProvider`.** Trade-off: sign-in needs a store that
  accepts the token keys, and users sign in again.

## Decision

1. Use the official SDKs. The user chose this on 2026-11-20 for a faithful port of the servers; it is a
   deliberate departure from `docs/practice/api-clients.md`. The no-send and no-permanent-delete guarantee is
   held by tests instead of by the endpoints not existing: a scan of the sources for the forbidden calls,
   and a recording fake API that flags forbidden requests. Tests point the SDK at a local fake through a
   per-call `rootUrl` and `OAuth2Client`'s `endpoints.oauth2TokenUrl`.
2. Keep the OAuth client (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and the refresh tokens
   (`<keyPrefix><SERVICE>_TOKEN_<SLUG>`) as secrets in the project's stores. Reads go through the
   provider's `stores`, writes by `auth` through its `target`. Configuration, accounts and label rules, is
   code passed to `defineGmailCommands` and `defineDriveCommands`.
3. Gmail may move a thread to the Trash and mark it as spam, as `thread label --add TRASH`/`SPAM`;
   permanent deletion stays forbidden, and with it emptying the Trash, which Gmail can only do through
   `delete`/`batchDelete`. The user changed this on 2026-11-20, replacing a guarantee that nothing but a
   discarded draft is ever trashed: a prompt injection that trashes the whole mailbox is recoverable from
   the Trash, a permanent delete is not. The forbidden-call scan and the recording fake cover the
   permanent-delete endpoints and sending; trashing is not guarded.

## Consequences

- Heavier dependencies than hand-modelled endpoints. Every new SDK call a command makes must pass the
  forbidden-call scan and the recording fake before it lands.
- A `rootUrl` is passed on every call, not once on the client; forgetting it on a media upload sends the
  request to Google in a test. A newer `googleapis-common` may fix this; recheck before relying on it.
- Users sign in again: tokens of the old servers are not migrated.
- Access tokens stay in memory, so each command refreshes once. Nothing is written back: a refresh token
  Google no longer accepts fails with `invalid_grant`, and the error names `auth --login-hint <email>`.
- The repo's `target` must accept the token keys and return the same store instance that is in `stores`;
  with a `cached` store a different instance leaves a fresh sign-in hidden until the TTL expires.
- `auth` opens a browser, so a person runs it, never an agent.
- An agent can trash or mark as spam any thread, steered by text in an email it read. Recovery is manual,
  from the Trash or Spam within Gmail's 30 days.
