---
name: secrets
description: >-
    Secrets in a repo built on @nzyme/secrets — every credential the repo's code, scripts or tools
    need is a mapped secret in a remote store, loaded into env variables. Covers adding a secret and
    asking the user for its value through a masked dialog (`secrets set --prompt`), running a command
    with the secrets (`secrets run`), diagnosing a missing secret or rejected token (`secrets list`),
    and what never to do with a value. Use whenever a task needs an API key, token, password or other
    credential, when a secret is missing, when the user is about to paste one into the chat, and
    before running anything that could print the environment or read the keychain.
---

# Secrets

The repo keeps its secrets in a remote store (Bitwarden Secrets Manager today) behind a login.
A service resolving to a `SecretsMapping` maps each env variable to a secret; the app calls
`loadSecrets(container, provider)` at startup, so the code reads secrets through `defineEnvVariable` like any
other variable (`nzyme:ioc`). Values are cached in the OS keychain. There is no secrets file:
every credential — the app's, a script's, a token a tool needs — is a mapped secret, so it has one
home and one way in.

The repo's own `.claude/skills/secrets/SKILL.md` says what is true only there: how the CLI is
invoked (`bun nzyme secrets …` or the product's CLI), where the provider lives, which store and
environments exist, whose machines can write. Read it; this skill uses `secrets …` for the command.
API and options: `@nzyme/secrets` README (`nzyme/packages/secrets/README.md` in a product repo).

## A value never enters the transcript

Whatever you read and whatever a command prints stays in the session transcript for good, and the
transcript is stored, synced and re-read. A value that lands there is leaked and has to be rotated.
The commands never print values; the leaks come from around them:

- **The environment.** `secrets run -- <cmd>` hands the secrets to `<cmd>`, so its output reaches
  you: never `env`, `printenv`, `set`, `export -p`, `node -e 'console.log(process.env)'` or a script
  that dumps its config. Run the app or the test you need; to know whether a variable is set, use
  `secrets list`.
- **The keychain.** Tokens and cached values sit under the service `nzyme-secrets`, readable by any
  `bun` process of the user without a prompt. Never `security find-generic-password -w`,
  `Bun.secrets.get`, or a script that calls either.
- **The store.** Never fetch a value from Bitwarden yourself (API, `bws`, web vault).
- **Your own output.** A value never goes into a command argument, a file, a log field
  (`nzyme:logging`), an error message, a test snapshot or a commit. Tests set `EnvVariables` in the
  container with fake values.

To check a value is right without seeing it, run what uses it: the app, an API call through
`secrets run`, `secrets list` for presence.

## Adding a secret

1. Add the mapping line to the provider (`DATABASE_URL: 'DATABASE_URL'`, the variable name to its
   key in the store), and declare the variable
   with `defineEnvVariable` where the code reads it.
2. Ask the user for the value through a masked dialog. Tell them it is coming — it opens outside
   the terminal — then run:

   ```sh
   secrets set STRIPE_KEY --prompt="Stripe test secret key: dashboard → Developers → API keys"
   ```

   The hint is for the person: which site, which page, which scope. It needs the `=`
   (`--prompt "…"` is a usage error).
3. Read the outcome:
   - **written** — prints the name, key, store and character count. A suspicious length is your only
     clue to a mistyped value; confirm by running what uses it.
   - **nothing entered** (cancelled, blank, timed out after 5 minutes) — nothing written; ask the
     user whether to retry.
   - **no dialog or terminal** (ssh, a cloud session) — give the user the command from the error to
     run in their own terminal, then confirm with `secrets list`.

Writing needs a token that may write; a read-only one is refused, and the error says so.

## When a secret is missing or a token is rejected

`secrets list` shows each mapped name with its store, key and status (`resolves`, `missing`,
`overridden by environment`). A missing secret is added as above. A missing or rejected token is
the user's to fix with `secrets login`, because only they hold it; tell them and stop. `overridden by environment` means a variable set in the shell, or in
a leftover `.env` that Bun loads on its own, wins over the store.

## A value pasted into the chat

It is in the transcript now. Do not store that copy, and do not repeat it. Tell the user plainly
that it is exposed, that it should be revoked or rotated where it was issued, and collect the new
value with `secrets set --prompt`.
