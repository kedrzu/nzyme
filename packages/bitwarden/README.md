# @nzyme/bitwarden

Bitwarden Secrets Manager as a store for [`@nzyme/secrets`](../secrets/README.md), with its own client
and WebCrypto; no `bws` binary, no native module. Why: `docs/decisions/own-bitwarden-client-over-bws.md`.

```ts
import { bitwarden } from '@nzyme/bitwarden/bitwarden.js';

const bw = bitwarden({ project: '1f0c…' });
```

- `project` — the Secrets Manager project id; the store reads and writes only its secrets.
- `server` — Bitwarden Cloud US by default. `https://vault.bitwarden.eu` for Cloud EU, or the base URL
  of a self-hosted server (which serves `/identity` and `/api`). It must use `https:`, except on
  localhost, so the token never travels unencrypted.
- `keychainSuffix` — keeps this store's token apart from other stores on the same server, for example
  one token per project or per Bitwarden organization. See [Several tokens on one
  machine](#several-tokens-on-one-machine).

A read costs at most three requests (login, project listing, one fetch), however many keys.

## Setup

1. **A dedicated organization.** Create a Bitwarden organization used only for Secrets Manager, not
   the one holding the team's passwords. A token's reach is then limited to that organization's
   secrets by construction, not only by its permissions.
2. **Projects.** One project per repo or per environment, as the repo's mapping expects. Copy the
   project id into `bitwarden({ project })`.
3. **A machine account per machine,** with read-write access to the project. A machine meant only to
   read (a server, a CI runner) gets a read-only machine account; its writes fail with 403.
4. **Access tokens.** Create an access token for each machine account and give it to whoever runs
   that machine.
5. **Log in** on each machine:

   ```bash
   nzyme secrets login
   ```

   The token is read from a hidden prompt
   (or stdin), checked against the server, and stored in the OS keychain under the server's host, so a
   token is never sent to another server. One token serves reading and writing.

In CI, or on Linux without a keychain, set `BWS_ACCESS_TOKEN` instead; it takes the place of the
stored token, and `secrets run` removes it from the child's environment.

## Several tokens on one machine

Without a suffix, every store on a server shares one stored token, so logging in from one project
replaces it for the others. Give a project its own:

```ts
const bw = bitwarden({ project: '1f0c…', keychainSuffix: 'healed' });
```

The token is stored as `bitwarden:<host>#healed`, so it stays bound to its server: the same suffix on
another server is a separate token.

- A project that adds a suffix runs `secrets login` again. The unsuffixed token stays for the projects
  still using it, and a suffixed store never falls back to it.
- `BWS_ACCESS_TOKEN`, when set, still takes the place of any stored token.
- Values cached by `cached()` are kept per server and project, so stores with different suffixes
  reading one project share them.

## Why a token cannot reach passwords

A machine-account token logs in with scope `api.secrets`, which the Bitwarden server accepts only on
Secrets Manager endpoints. The vault requires scope `api`, which a machine account cannot get. A
leaked token exposes the Secrets Manager projects its machine account can access, never vault items.

## Keychain

Tokens, and values cached by `cached()`, are stored with `Bun.secrets` under the service
`nzyme-secrets`.

Any `bun` process of the same user can read them without a prompt: on macOS (Bun 1.4.4, checked 2026-11-02) a separate `bun` script read the tokens that `nzyme secrets login` had stored. The keychain protects them from other users and from a stolen disk, not from code you run. Linux is not checked yet.
