# Slack CLI with the auth defined once by the product

## Status

Accepted

## Context

A product CLI carried a set of Slack commands for agents: sign in, read, search, look up channels and
people, and send, edit and wait for replies as the developer, through their own user token. A second
product needs the same commands. Only the configuration differs between them: the Slack app, the secret
holding the sign-in, the command names and where a task link comes from.

The developer's token is needed outside the commands too, for example by a deploy run from a laptop.
The Slack app uses PKCE, and Slack rotates a PKCE app's user tokens: the access token lives 12 hours and
a refresh token issues the next pair, with no client secret. A refresh token works once, so every reader
of the token has to go through the same refresh.

## Options Considered

Where the commands live:

- **A. Inside `@nzyme/slack`.** Trade-off: no new package; but `@nzyme/slack` is a CJS runtime library
  that backends use, `@nzyme/secrets` is not built as CJS, and the CLI dependencies (`cli-core`,
  `secrets`, the sign-in server) would land on every runtime consumer.
- **B. A new `@nzyme/slack-cli` on top of `@nzyme/slack`.** Trade-off: one more package; in exchange the
  runtime library stays lean, and the name follows the `<tool>-cli` convention of `gmail-cli` and
  `gdrive-cli`.

How the auth is shared:

- **Defined inside the command set**, as `defineGmailCommands` does with `defineGoogleAuth`. Trade-off:
  only the commands can reach the token, so other code would need a second refresh path that spends the
  same refresh token.
- **`defineSlackAuth`, defined once by the product** and passed to `defineSlackCommands`. Trade-off: the
  product wires one more unit; in exchange the commands and any other code share one service, and one
  refresh.

How the sign-in is stored:

- **Three secrets**: the access token, the refresh token and the expiry. Trade-off: three values that must
  change together, written one by one, and three secrets a product declares.
- **One JSON secret `{ accessToken, refreshToken, expiresAt }`**, mirroring the Google token secret.
  Trade-off: the value is not a bare token a tool could read directly; in exchange one write replaces the
  whole grant, and the options name one secret.

## Decision

Option B: `@nzyme/slack-cli` holds the commands, their helpers and the sign-in, on top of the Slack
utilities in `@nzyme/slack`.

The product defines the auth once with `defineSlackAuth` and passes it to `defineSlackCommands`, along
with a prefix and an optional task-link callback. The auth service is unscoped, unlike `defineGoogleAuth`,
which is `CommandScope`-scoped, so code outside a command can resolve it from the root container.

The sign-in lives in one JSON secret. The auth reads it on every call, refreshes it an hour before it
expires, and stores the new grant.

## Consequences

- A product's secrets provider must not be `CommandScope`-scoped: the unscoped auth service depends on
  it.
- A second product gets the commands by defining its auth and calling `defineSlackCommands`; the
  configured sign-in command, token secret, prefix and task link appear in every message and path.
- Two processes refreshing at the same moment are not coordinated: the one whose refresh token Slack
  refuses asks the developer to sign in again.
- Help text cannot name the token secret or the redirect URI: the commands receive the auth as a unit,
  whose options are known only once it is resolved.
