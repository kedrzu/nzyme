# @nzyme/bitwarden

Bitwarden Secrets Manager as a store for [`@nzyme/secrets`](../secrets/README.md), with its own client
and WebCrypto; no `bws` binary, no native module. Why: `docs/decisions/own-bitwarden-client-over-bws.md`.

```ts
import { bitwarden } from '@nzyme/bitwarden/bitwarden.js';

const bw = bitwarden({ project: '1f0c…' });
```

- `project` — the Secrets Manager project id; the store reads and writes only its secrets.
- `server` — Bitwarden Cloud US by default. `https://vault.bitwarden.eu` for Cloud EU, or the base URL
  of a self-hosted server (which serves `/identity` and `/api`).

A read costs at most three requests (login, project listing, one fetch), however many keys.

## Setup

1. **A dedicated organization.** Create a Bitwarden organization used only for Secrets Manager, not
   the one holding the team's passwords. A token's reach is then limited to that organization's
   secrets by construction, not only by its permissions.
2. **Projects.** One project per repo or per environment, as the repo's mapping expects. Copy the
   project id into `bitwarden({ project })`.
3. **Two machine accounts:** one with read access to the project, one with read-write access.
4. **Access tokens.** Create an access token for each machine account and give it to the developers
   who need it.
5. **Log in** on each machine:

   ```bash
   nzyme secrets login        # read-only token: startup, `secrets run`, `secrets list`
   nzyme secrets login --write # read-write token: `secrets set`, `secrets import`
   ```

   With several stores, name one: `nzyme secrets login bw`. The token is read from a hidden prompt
   (or stdin), checked against the server, and stored in the OS keychain under the server's host, so a
   token is never sent to another server.

In CI, or on Linux without a keychain, set `BWS_ACCESS_TOKEN` instead; it is used for both reading
and writing, and `secrets run` removes it from the child's environment.

## Why a token cannot reach passwords

A machine-account token logs in with scope `api.secrets`, which the Bitwarden server accepts only on
Secrets Manager endpoints. The vault requires scope `api`, which a machine account cannot get. A
leaked token exposes the Secrets Manager projects its machine account can access, never vault items.

## Keychain

Tokens, and values cached by `cached()`, are stored with `Bun.secrets` under the service
`nzyme-secrets`.

Any `bun` process of the same user can read them without a prompt: on macOS (Bun 1.4.4, checked 2026-11-02) a separate `bun` script read the tokens that `nzyme secrets login` had stored. The keychain protects them from other users and from a stolen disk, not from code you run. Linux is not checked yet.
