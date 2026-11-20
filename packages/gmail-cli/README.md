# @nzyme/gmail-cli

Gmail commands for agents: search and read threads as Markdown, Markdown drafts with attachments, and
label rules. An agent calls a CLI command, so no tool schema sits in its context in every session. No
command sends mail or permanently deletes anything; moving to the Trash and marking as spam are allowed,
because both are recoverable.

Sign-in, token storage and the Google Cloud app are in [`@nzyme/google-auth`](../google-auth). Why the
package is built this way: `docs/decisions/google-clis-on-official-sdks-with-tokens-in-secret-stores.md`.

## Installation

```bash
bun add @nzyme/gmail-cli @nzyme/cli-core
```

## Register

Spread the commands into the product CLI's `execute` (its `packages/cli`,
`docs/decisions/product-clis-over-nzyme-plugins.md`):

```ts
// packages/cli/src/cli.ts
import * as os from 'node:os';
import * as path from 'node:path';

import { execute } from '@nzyme/cli-core/execute.js';
import { defineGmailCommands } from '@nzyme/gmail-cli/defineGmailCommands.js';

import { AppGoogleClients } from '@acme/app/AppGoogleClients.js';
import { AppSecrets } from '@acme/secrets/AppSecrets.js';
import { GMAIL_TOKENS } from '@acme/secrets/secrets.js';

await execute({
    name: 'acme',
    commands: [
        // ...the product's other commands
        ...defineGmailCommands({
            auth: {
                provider: AppSecrets,
                tokens: GMAIL_TOKENS,
                client: AppGoogleClients,
                accounts: ['*@acme.com'],
            },
            labels: {
                groups: { status: ['AI/Done', 'AI/Triage'], priority: ['P/0', 'P/1', 'P/2'] },
                require: [{ when: 'AI/Done', group: 'priority' }],
                archiveMarkers: ['Outdated', 'Junk'],
                views: { unprocessed: '-label:AI/Done -label:AI/Triage' },
            },
            files: {
                roots: [path.join(os.homedir(), 'Notes')],
                attachmentsDir: path.join(os.homedir(), '.cache', 'acme', 'attachments'),
            },
        }),
    ],
});
```

`defineGmailCommands` throws on malformed label rules or a path that is not absolute.

## Before the first use

1. Create the Google Cloud app, and declare and store `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
   behind your `GoogleClientProvider` ([`@nzyme/google-auth`](../google-auth#the-google-cloud-app)).
2. Declare `GMAIL_TOKENS` in the product's `@<product>/secrets` (`packages/secrets/src/secrets.ts`) with
   `meta: { store: 'personal' }`. Route it to a per-developer store (the keychain), never the shared team
   store: anyone who reads the shared store could act as every mailbox signed in
   ([why](../google-auth#token-storage)). `target` must return a store listed in `stores`, or a cached
   store hides a fresh sign-in until its TTL.
3. **The user runs `gmail auth`, not the agent.** It opens a browser; `--no-browser` only prints the URL.
   Users sign in again after moving from the former MCP server: tokens are not migrated.

## Options

|Option|Default|Meaning|
|-|-|-|
|`auth`|required|The `GoogleAuthOptions` of [`@nzyme/google-auth`](../google-auth#options): `provider`, `tokens`, `client`, `accounts`|
|`prefix`|`gmail`|The command path prefix, space-separated|
|`labels`|none|Label rules and views, below. Without them labels are free-form|
|`files`|none|Local files the commands may touch, below|
|`reply`|system|`locale` and `timeZone` of the attribution line of a reply quote (`On Mon, Sep 28, 2026 … wrote:`); `pl` gets the Polish template, any other locale the English one|

### Label rules

Four building blocks, enforced by `thread label` and offered by `search`:

- `groups`: mutually exclusive label sets. They change only through `--set group=label` (`group=` clears
  the group); naming a group label in `--add` or `--remove` is rejected. Missing group labels are created
  on first use. A label belongs to at most one group.
- `require`: a thread that carries `when` must also carry one label of `group`. Checked on the resulting
  labels before anything is written.
- `archiveMarkers`: the only way out of INBOX. Adding a marker removes INBOX; removing INBOX without a
  marker on the thread is rejected. Without markers archiving is unrestricted.
- `views`: named Gmail queries; `search --view <name>` ANDs the view with the query.

Group labels and markers are also protected from `labels cleanup`.

### Files

- `roots`: directories, besides the repo root, that draft attachments may be read from.
- `attachmentsDir`: where `attachment save` writes, `<dir>/<messageId>/<file>`. Default
  `~/.cache/gmail-cli/attachments`. Always allowed as an attachment source.

Every path is absolute.

## Commands

`--account <email>` selects the account on every command below the first two; it is needed only when
several accounts are usable. `gmail auth` and `gmail accounts` are the shared commands of
[`@nzyme/google-auth`](../google-auth#signing-in).

|Command|Does|
|-|-|
|`gmail search [query]`|Search threads with Gmail syntax; `--view`, `--limit`|
|`gmail thread <id>`|Read a thread as Markdown; `--raw` prints the original bodies|
|`gmail message <id>`|Read one message as Markdown; `--raw`|
|`gmail thread label <id>`|Change labels under the rules: `--add`, `--remove`, `--set`; `--add TRASH` moves the thread to the Trash, `--add SPAM` marks it as spam, `--remove` undoes either|
|`gmail labels list`|List the account's labels|
|`gmail labels create <name>`|Create a label|
|`gmail labels cleanup <prefix>`|Delete the empty labels under a prefix; `--dry-run`|
|`gmail attachment save <messageId> <partId>`|Save an attachment to the attachments directory|
|`gmail draft create`|Create a draft from Markdown (`--body-file`, `-` for stdin; `--html`); `--to`, `--cc`, `--bcc`, `--subject`, `--thread`, `--in-reply-to`, `--attach`, `--signature`, `--quote`|
|`gmail draft update <id>`|Change a draft; also `--remove-attachment`|
|`gmail draft list`|List drafts; `--query`, `--thread`, `--limit`|
|`gmail draft get <id>`|Read a draft as Markdown|
|`gmail draft discard <id>`|Move a draft to the Trash|

## Safety limits

- Nothing sends mail and nothing permanently deletes a message, thread or draft, so nothing can empty
  the Trash. The Google SDK could call both, so the guarantee is held by tests: a scan of the sources for
  the forbidden calls, and a recording fake API that fails on a forbidden request.
- Trash and spam are allowed: `thread label <id> --add TRASH` or `--add SPAM`. A thread trashed by
  mistake, or by a prompt injection, is restored from the Trash (Gmail keeps it 30 days) with
  `--remove TRASH`.
- `draft discard` moves a draft to the Trash, and only after checking it carries the `DRAFT` label.
- `labels cleanup` deletes only labels that no message carries.
- Local files are read (attachments) and written (saved attachments) only under the repo root,
  `files.roots` and the attachments directory. Secret files (`.env*`, OAuth client files, credentials and
  token files) are refused even inside them.
- An account the project's `auth.accounts` excludes is listed as `not allowed` and cannot be used.
