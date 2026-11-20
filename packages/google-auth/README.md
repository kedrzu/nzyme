# @nzyme/google-auth

Google sign-in shared by the nzyme Google CLIs (`@nzyme/gmail-cli`, `@nzyme/gdrive-cli`): the OAuth client
read from a `SecretsProvider`, the browser sign-in, refresh tokens kept in the secret stores, and the
`auth` and `accounts` commands.

## Token keys

Each account's refresh token is a secret under `<keyPrefix><SERVICE>_TOKEN_<SLUG>` (default prefix
`GOOGLE_`, service `GMAIL` or `DRIVE`; `SLUG` is the email upper-cased, every non-alphanumeric character
turned into `_`). Sign-in writes it through the provider's `target(key)`, so `target` must accept keys of
this pattern, and it must return the same store instance that is listed in `stores`, or the token is not
read back.
