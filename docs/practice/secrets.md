# Secrets

The repo keeps its secrets in a remote store (Bitwarden Secrets Manager today) behind a login, or, for
secrets of one developer on one machine, in the local OS keychain (`keychainStore`).
A store is scoped by a prefix and its secrets are keyed by the variable name. Every secret is declared
with `defineSecret` in the repo's secrets package (`packages/secrets`), and code reads it only through the
container: `container.resolve(SECRET)` or a service's `deps` ([ioc](ioc.md)), never `process.env` or a raw
binding. A process loads the values into its config document at startup — a script or CLI from the store
(`secretsSource`), a Worker or server from what its platform hands it. Only an external tool gets them as
environment variables, through `bun secrets run`. Values are cached in the OS keychain. There is no secrets file:
every credential — the app's, a script's, a token a tool needs — is a secret in a store, so it has one
home and one way in.

What is true only in one repo — how the product CLI behind `bun secrets …` is built,
where the stores are defined, which prefixes and environments exist, which store a name goes to,
whose machines can write — sits above this document. The commands run as `bun secrets …` in every repo, through its `secrets` wrapper script.
API and options: `@nzyme/secrets` README (`nzyme/packages/secrets/README.md` in a product repo).

## A value never enters the transcript

Whatever you read and whatever a command prints stays in the session transcript for good, and the
transcript is stored, synced and re-read. A value that lands there is leaked and has to be rotated.
The commands never print values; the leaks come from around them:

- **The environment.** `bun secrets run <KEY>... -- <cmd>` hands the named secrets to `<cmd>`, so its output reaches
  you: never `env`, `printenv`, `set`, `export -p`, `node -e 'console.log(process.env)'` or a script
  that dumps its config. Run the app or the test you need; to know whether a variable is set, use
  `bun secrets list`.
- **The keychain.** Tokens and cached values sit under the service `nzyme-secrets`, readable by any
  `bun` process of the user without a prompt. Never `security find-generic-password -w`,
  `Bun.secrets.get`, or a script that calls either.
- **The store.** Never fetch a value from Bitwarden yourself (API, `bws`, web vault).
- **Your own output.** A value never goes into a command argument, a file, a log field
  ([logging](logging.md)), an error message, a test snapshot or a commit. Tests set `EnvVariables` in the
  container with fake values.

To check a value is right without seeing it, run what uses it: the app, an API call through
`bun secrets run`, `bun secrets list` for presence.

## Adding a secret

1. Declare it with `defineSecret` in `packages/secrets` (a name, a `description`, optionally `enabled`
   and `meta`), and resolve it through the container where the code needs it. There is no mapping to edit: the key in
   the store is the name. `bun secrets set` refuses a name that is not declared or not enabled here, and the
   provider's write policy may refuse it too; the message says why.
2. Ask the user for the value through a masked dialog. Tell them it is coming — it opens outside
   the terminal — then run:

   ```sh
   bun secrets set STRIPE_KEY --prompt="Stripe test secret key: dashboard → Developers → API keys"
   ```

   The hint is for the person: which site, which page, which scope. It needs the `=`
   (`--prompt "…"` is a usage error).
3. Read the outcome:
   - **written** — prints the name, store and character count. A suspicious length is your only
     clue to a mistyped value; confirm by running what uses it.
   - **nothing entered** (cancelled, blank, timed out after 5 minutes) — nothing written; ask the
     user whether to retry.
   - **no dialog or terminal** (ssh, a cloud session) — give the user the command from the error to
     run in their own terminal, then confirm with `bun secrets list`.

Writing needs a token that may write; a read-only one is refused, and the error says so.

The OAuth refresh tokens of the Google CLIs (`gmail-cli`, `gdrive-cli`) are secrets too, written by
`<prefix> auth`, which the user runs: it needs a browser, so never run it yourself.

## When a secret is missing or a token is rejected

`bun secrets list` shows every declared secret that applies here with its store id, `missing` or `overridden by environment`, then stored keys that are `not declared` or `not enabled here`. A `missing` name: add it as above. A missing or rejected token is
the user's to fix with `bun secrets login`, because only they hold it; tell them and stop. `overridden by environment` means a variable set in the shell, or in
a leftover `.env` that Bun loads on its own, wins over the store.

## A value pasted into the chat

It is in the transcript now. Do not store that copy, and do not repeat it. Tell the user plainly
that it is exposed, that it should be revoked or rotated where it was issued, and collect the new
value with `bun secrets set --prompt`.
