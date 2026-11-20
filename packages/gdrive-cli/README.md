# @nzyme/gdrive-cli

Google Drive commands for agents: search, list, read Docs as Markdown and Sheets as CSV, download with
export, upload with conversion, replace contents, edit metadata, trash and restore. What an agent may do is
set per project with permission switches; a command whose switch is off does not exist. An agent calls a
CLI command, so no tool schema sits in its context in every session.

Sign-in, token storage and the Google Cloud app are in [`@nzyme/google-auth`](../google-auth). Why the
package is built this way: `docs/decisions/google-clis-on-official-sdks-with-tokens-in-secret-stores.md`.

## Installation

```bash
bun add @nzyme/gdrive-cli @nzyme/cli-core
```

## Register

Spread the commands into the product CLI's `execute` (its `packages/cli`,
`docs/decisions/product-clis-over-nzyme-plugins.md`):

```ts
// packages/cli/src/cli.ts
import * as os from 'node:os';
import * as path from 'node:path';

import { execute } from '@nzyme/cli-core/execute.js';
import { defineDriveCommands } from '@nzyme/gdrive-cli/defineDriveCommands.js';

import { AppGoogleClients } from '@acme/app/AppGoogleClients.js';
import { AppSecrets } from '@acme/secrets/AppSecrets.js';
import { GDRIVE_TOKENS } from '@acme/secrets/secrets.js';

await execute({
    name: 'acme',
    commands: [
        // ...the product's other commands
        ...defineDriveCommands({
            auth: {
                provider: AppSecrets,
                tokens: GDRIVE_TOKENS,
                client: AppGoogleClients,
                accounts: ['*@acme.com'],
            },
            permissions: { upload: true },
            files: {
                roots: [path.join(os.homedir(), 'Notes')],
                downloadsDir: path.join(os.homedir(), '.cache', 'acme', 'downloads'),
            },
        }),
    ],
});
```

`defineDriveCommands` throws on a path that is not absolute.

## Before the first use

1. Create the Google Cloud app, enable the Drive API, and declare and store `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
   behind your `GoogleClientProvider` ([`@nzyme/google-auth`](../google-auth#the-google-cloud-app)).
2. Declare `GDRIVE_TOKENS` in the product's `@<product>/secrets` (`packages/secrets/src/secrets.ts`) with
   `meta: { store: 'personal' }`. Route it to a per-developer store (the keychain), never the shared team
   store: anyone who reads the shared store could act as every account signed in
   ([why](../google-auth#token-storage)). `target` must return a store listed in `stores`, or a cached
   store hides a fresh sign-in until its TTL.
3. **The user runs `drive auth`, not the agent.** It opens a browser; `--no-browser` only prints the URL.
   Users sign in again after moving from the former MCP server: tokens are not migrated.

## Options

|Option|Default|Meaning|
|-|-|-|
|`auth`|required|The `GoogleAuthOptions` of [`@nzyme/google-auth`](../google-auth#options): `provider`, `tokens`, `client`, `accounts`|
|`prefix`|`drive`|The command path prefix, space-separated|
|`permissions`|below|Switches overriding the defaults one by one|
|`files`|none|`roots`: directories, besides the repo root, uploads read from and downloads write to. `downloadsDir`: where `download` writes by default, `~/.cache/gdrive-cli/downloads`. Absolute paths|

### Permissions

|Permission|Default|Commands|
|-|-|-|
|`browse`|on|`search`, `ls`, `info`, `drives`|
|`download`|on|`read`, `download`|
|`upload`|off|`upload`, `mkdir`|
|`edit`|off|`update`, `meta`|
|`delete`|off|`trash`, `restore`|

`auth` and `accounts` are always registered. The OAuth scope is the full `drive` scope, because one token
serves every project that uses the account: the switches are enforced by not registering the commands, not
by the token.

## Commands

`--account <email>` selects the account on every command but `auth` and `accounts`; it is needed only when
several accounts are usable. A file is given as an id or a Drive URL.

|Command|Permission|Does|
|-|-|-|
|`drive search [query]`|`browse`|Search My Drive, shared with me and shared drives; `--folder`, `--type`, `--limit`, `--page-token`|
|`drive ls [folder]`|`browse`|List a folder; `--limit`, `--page-token`|
|`drive info <file>`|`browse`|Show a file's metadata|
|`drive drives`|`browse`|List the shared drives|
|`drive read <file>`|`download`|Print contents as text (Docs as Markdown, Sheets as CSV); `--max-chars`|
|`drive download <file>`|`download`|Save to disk with export; `--to`, `--format`, `--overwrite`|
|`drive upload`|`upload`|Create a file from `--file` or stdin; `--name`, `--folder`, `--convert`, `--description`|
|`drive mkdir <name>`|`upload`|Create a folder; `--parent`|
|`drive update <file>`|`edit`|Replace contents from `--file` or stdin; `--content-type`|
|`drive meta <file>`|`edit`|Rename, describe, star or move: `--name`, `--description`, `--star`, `--unstar`, `--move-to`|
|`drive trash <file>`|`delete`|Move a file to the trash|
|`drive restore <file>`|`delete`|Take a file out of the trash|

## Safety limits

- No command deletes a file permanently, empties the trash or edits a file's sharing settings. The
  Google SDK could do all three, so the guarantee is held by tests: a scan of the sources for the
  forbidden calls, and a recording fake API that fails on a forbidden request.
- A file inherits the sharing of the folder or shared drive it sits in, so `meta --move-to`, `upload --folder` and `mkdir --parent` into a shared one expose the file to everyone it is shared with.
- A write command exists only when the project turned its permission on.
- Local files are read (uploads) and written (downloads) only under the repo root, `files.roots` and the
  downloads directory. Secret files (`.env*`, OAuth client files, credentials and token files) are refused even inside them.
- An account the project's `auth.accounts` excludes is listed as `not allowed` and cannot be used.
