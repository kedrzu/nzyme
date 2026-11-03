# Own Bitwarden Secrets Manager client over `bws`

## Status

Accepted

## Context

Bitwarden Secrets Manager is the first store behind `@nzyme/secrets`
(`secrets-as-code-through-env-variables.md`). The store must read a batch of keys, write values
without exposing them, and keep its credentials in the OS keychain.

> **Checked 2026-11-01:** `bws` 2.1.0 (released 2026-05-21) takes a secret value only as an argument,
> visible in the process list (`bitwarden/sdk-sm` issue #1568, open). `bws secret list` aborts with
> SIGABRT on 2.0.0 (#1575, open). There is no Homebrew formula. `bws` keeps session state on disk
> (`~/.config/bws/state`).

> **Checked 2026-11-01:** `@bitwarden/sdk-napi` is a beta native module last released in 2024, under
> the Bitwarden license, not an OSI license.

> **Checked 2026-11-01:** a machine-account token logs in with scope `api.secrets`, which only the
> `Secrets` authorization policy accepts (`bitwarden/server` `src/Api/Startup.cs:150-155`). The vault
> (`CiphersController`) requires the `Application` policy, scope `api` (`Startup.cs:117-121`). A
> Secrets Manager token cannot reach the organization's passwords.

> **Checked 2026-11-01:** Bitwarden publishes no OpenAPI document. It is a build artifact of
> `bitwarden/server` (AGPL), so a document generated from it is AGPL-derived.

## Options Considered

- **Wrap the `bws` binary.** Rejected: values on argv, an open crash on listing, no Homebrew
  install, and session state outside the keychain.
- **`@bitwarden/sdk-napi`.** Rejected: an unmaintained beta native module under a non-OSI license.
- **Own client.** The protocol is small: client-credentials login, the organization key decrypted
  from the login response, list, get, create and update of project secrets, AES-CBC with HMAC
  EncStrings. Implemented with WebCrypto, from the behaviour of `bitwarden/sdk-internal`,
  `bitwarden/server` (AGPL) and the MIT `@varlock/bitwarden-plugin` 2.0.2; no code copied.

## Decision

`@nzyme/bitwarden` ships its own client: `bitwarden({ project, server? })` returns a `SecretStore`.

- API types are hand-written, because nzyme is MIT and a generated OpenAPI document is AGPL-derived.
  They were checked against a locally built document, which is not committed.
- One token per machine: `secrets login` stores it in the keychain, keyed by server host, so a token
  is never sent to another server. `BWS_ACCESS_TOKEN` overrides it, for CI and Linux. A machine
  meant only to read gets a read-only machine account, and its writes fail with 403. A separate read
  and write token per machine was dropped in review (PR #258): any `bun` process of the user reads
  both keychain items without a prompt, so the split protected little.

## Consequences

- Protocol changes on Bitwarden's side are ours to follow; the tests pin the crypto against known
  vectors and the HTTP exchange against a fake server.
- A leaked token exposes one organization's Secrets Manager projects that its machine account can
  reach, never vault passwords. A dedicated organization for Secrets Manager limits it further.
- AWS Secrets Manager will be a separate store, not an extension of this client.
