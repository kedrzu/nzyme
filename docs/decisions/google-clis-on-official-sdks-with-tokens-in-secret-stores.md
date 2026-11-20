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

**2. Where the credentials live.** The OAuth client id and secret, and the refresh tokens of every
account and service, are credentials. `docs/decisions/secrets-declared-and-resolved-through-the-container.md`
makes the project's declared secrets, kept in its stores, the one home of every credential.

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
- **Declared secrets in the project's stores, through its `SecretsProvider`.** Trade-off: sign-in needs a
  store the project routes the token secret to, and users sign in again.

How to key the tokens:

- **One secret per account**, named from the email (`GOOGLE_GMAIL_TOKEN_ANN_ACME_COM`). Trade-off: the name
  is not known until sign-in, so it cannot be declared, and `secrets set` and `secrets list` cannot see it.
- **One static secret per service holding a JSON dictionary by email.** Trade-off: one value holds every
  account, so a write rewrites it whole; in exchange `GMAIL_TOKENS` is declared like any secret, and its
  store is the project's routing decision.

## Decision

1. Use the official SDKs. The user chose this on 2026-11-20 for a faithful port of the servers; it is a
   deliberate departure from `docs/practice/api-clients.md`. The no-send and no-permanent-delete guarantee is
   held by tests instead of by the endpoints not existing: a scan of the sources for the forbidden calls,
   and a recording fake API that flags forbidden requests. Tests point the SDK at a local fake through a
   per-call `rootUrl` and `OAuth2Client`'s `endpoints.oauth2TokenUrl`.
2. Keep each service's tokens in one static secret the product declares with `defineSecret`
   (`GMAIL_TOKENS`, `GDRIVE_TOKENS`). Its value is a JSON dictionary keyed by the lower-cased email, each
   entry a refresh token and its scopes. Accounts are picked with `--account <email>`; one usable account
   needs no flag, several fail with the list. The secret belongs in a per-developer store, never the shared
   team store: a refresh token is its owner's mailbox or Drive, and the shared store would let anyone who
   reads it act as every account signed in. Configuration (accounts, label rules) is code passed to
   `defineGmailCommands` and `defineDriveCommands`.
   - The tokens are read from the provider's `stores`, not from the container's config document: `auth`
     writes a token and reads it back within one command, and a config document is loaded once.
   - `resolveSecretTarget` of `@nzyme/secrets` is the single write path: it refuses a name the provider
     does not declare or enable, then asks `target`. `secrets set` and `auth` both use it, and `auth` calls it,
     and checks that the stored value parses, before the browser step, so a sign-in that cannot be saved is
     refused before the user consents.
3. `google-auth` is plain functions. The OAuth client comes from the product's service implementing
   `GoogleClientProvider` (`getClient(email)`), so which client serves which account is the product's
   decision and a repo can use several Google Cloud projects. Each command set gets a unit from
   `defineGoogleAuth(options)`, which receives the product's services (`provider`, `client`) through `deps`;
   no command looks them up in a service locator.
4. Gmail may move a thread to the Trash and mark it as spam, as `thread label --add TRASH`/`SPAM`;
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
- The product declares the token secrets and routes them to a per-developer store, and `target` must return
  the store listed in `stores`; with a `cached` store a different instance leaves a fresh sign-in hidden
  until the TTL expires. A product that sends the token secret to its shared store exposes every signed-in
  account to whoever reads it: the routing is the product's to get right.
- A write replaces the whole dictionary, so two simultaneous sign-ins to one service can lose one; sign-in is
  a person at a browser, rarely concurrent.
- `auth` opens a browser, so a person runs it, never an agent.
- An agent can trash or mark as spam any thread, steered by text in an email it read. Recovery is manual,
  from the Trash or Spam within Gmail's 30 days.
