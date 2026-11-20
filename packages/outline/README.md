# @nzyme/outline

A typed client for the [Outline](https://www.getoutline.com) API, `fakeOutline`, an in-memory Outline for tests, and a two-way sync of an Outline workspace with a local Markdown folder, run from Claude Code hooks. Why hooks and not a daemon: `docs/decisions/outline-sync-through-hooks.md`.

## Setup

1. The workspace admin creates an OAuth app at `<workspace>/settings/applications`: Client type **Public** (the default is Confidential), Callback URL `http://127.0.0.1/callback` without a port (loopback URIs match any port), not Published. Copy the Client ID.

2. Register the commands in the product CLI:

   ```ts
   import { defineOutlineCommands } from '@nzyme/outline/commands/defineOutlineCommands.js';

   await execute({
       name: 'cli',
       commands: defineOutlineCommands({
           url: 'https://app.getoutline.com',
           clientId,
           privateCollection: user => `${user.name} (private)`,
           commandHint: 'bun cli outline',
           userLanguage: 'Polish',
       }),
   });
   ```

3. Add the hooks to `.claude/settings.json`, replacing `cli` with the product CLI. Every hook has an explicit timeout; the stop hook keeps its own run within 40 s of its 60 s:

   ```json
   {
       "hooks": {
           "SessionStart": [{ "hooks": [{ "type": "command", "command": "cli outline hook session-start", "timeout": 60 }] }],
           "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "cli outline hook prompt", "timeout": 30 }] }],
           "Stop": [{ "hooks": [{ "type": "command", "command": "cli outline hook stop", "timeout": 60 }] }],
           "SessionEnd": [{ "hooks": [{ "type": "command", "command": "cli outline hook session-end", "timeout": 30 }] }]
       }
   }
   ```

4. Each user runs `cli outline login` (browser, once), then `cli outline pull` to finish the first download.

## How it works for the agent

The documents live in the repo's main checkout, in `documents/`:

- A collection is a folder; a document is `<slug>.md`, and its children are in `<slug>/` next to it.
- `drafts/` holds the user's unpublished documents; `shared-with-me/` the documents shared with the user whose collection the user cannot see.
- `_attachments/<id>-<name>` holds the files a document links to; a link to a local file is uploaded on the next push.
- A file put at the root of `documents/` is created in the user's private collection (`privateCollection`); until that collection exists, the file is not sent.
- `recovered/` holds files whose document is gone from Outline while they had unsent edits.

A file is a Markdown body under a `# ` title line, with optional frontmatter:

```md
---
outline: 3f2c9a4e-…
shared: [Ana Nowak, ana@example.com]
---

# Offer for the clinic

Text…
```

- `outline:` is the document id, written by the sync; a file without it is a new document. Other frontmatter keys are kept as they are but never sent to Outline, which has no frontmatter.
- Outline normalizes Markdown on write (bullets, tables, escaping), so a file may change in form after a push; the content stays the same.
- Names and slugs of existing files are never changed by the sync; a renamed title does not rename the file. Moving a file moves the document.

Conflicts:

- Edits to different paragraphs, local and in Outline, merge on their own.
- Edits to the same one leave `<<<<<<< local` … `>>>>>>> Outline (<name>)` markers in the file. A file with markers is never sent: the agent resolves it with the user and removes the markers.

Deletions:

- Deleting a file archives its document in Outline (never deletes it); a document that still has children with files is not archived.
- A document deleted or unshared in Outline is removed locally; with unsent edits it moves to `recovered/` instead.
- Mass-archive guard: archiving is refused for the whole run when the `documents/` folder is missing, when more than half of the tracked files vanish at once (once more than 3), or when every tracked file vanishes (two or more). The agent is told; nothing is archived until the files are back or the deletion is smaller.

Sharing:

- `shared:` lists the people a document is directly shared with, by name or e-mail (group names also resolve). Adding or removing an entry in the file adds or removes the membership; Outline's list is written back on a full pass.
- Only direct memberships are listed; access through a collection or a parent document is not.
- An entry matching no user or several users stays in the file and is reported every run. An entry Outline refuses is reported once and the list returns to Outline's.

Cadence:

- Session start: a full pass (pull, push, sharing). Prompt: an incremental pull at most once a minute, a full pass every 15 minutes. Stop and session end: push. A hook skips quietly while another session syncs.
- The incremental pull asks Outline only for documents changed since the last pull (1 to 2 requests). Only a full pass notices archived or deleted documents, lost access, sharing changes and new collections.
- Requests are limited to 100 per minute, 25 for creates; a full pass reads the share lists of at most 20 documents it has no local edit for, so a large workspace is covered over several passes.
- Nothing syncs while Claude Code is closed, and nothing is pulled during a turn.

## Client

```ts
import { OutlineClient } from '@nzyme/outline/outline/OutlineClient.js';
import { listAll } from '@nzyme/outline/outline/listAll.js';

const outline = new OutlineClient({
    url: 'https://app.getoutline.com',
    getAccessToken: async () => token,
});

const documents = await listAll(page => outline.documents.list({ ...page }));
```

- Every call is `POST {url}/api/<method>` with `Authorization: Bearer <token>`; `getAccessToken` runs before each request, so a refreshed token is picked up.
- Requests are paced by two token buckets: 100 per minute overall, 25 per minute for `documents.create` and `attachments.create`.
- A `429` waits for `Retry-After` and retries the same call. After 10 consecutive `429`s it throws `OutlineRateLimitError`.
- A `409` (stale `lastRevision`) throws `OutlineConflictError`; any other failure throws `OutlineApiError` with the HTTP status.
- The token never appears in a thrown error.
- `listAll(fetchPage)` walks `limit`/`offset` pages (100 per page) until a short page.

## Login and tokens

```ts
import { login } from '@nzyme/outline/auth/oauth.js';
import { createTokenProvider, outlineTokenStore } from '@nzyme/outline/auth/tokens.js';

const store = outlineTokenStore({ url });
await login({ url, clientId, store, lockPath });

const outline = new OutlineClient({
    url,
    getAccessToken: createTokenProvider({ url, clientId, store, lock: { kind: 'acquire', path: lockPath } }),
});
```

- `login` runs the OAuth authorization code flow with PKCE for a public client: a callback server on a free `127.0.0.1` port, the authorize page opened in the browser (macOS `open` by default), the `state` checked, scope `read write`, the tokens checked with `auth.info` and stored under the sync lock.
- The tokens of a workspace are one keychain item (`keychainStore`, scope `outline`, keyed by the workspace host), read anew on every call.
- `createTokenProvider` returns a token with more than 5 minutes left as is, and otherwise refreshes it under the sync lock (`{ kind: 'held' }` when the caller already holds it): the refresh token is read once the lock is held, and the rotated tokens are stored before the new access token is returned.
- A failed refresh is not retried by any process for a minute. No tokens, or a refresh token Outline refuses, throws `LoginRequiredError`.

## Commands and hooks

```ts
import { defineOutlineCommands } from '@nzyme/outline/commands/defineOutlineCommands.js';

await execute({
    name: 'cli',
    commands: defineOutlineCommands({
        url: 'https://app.getoutline.com',
        clientId,
        privateCollection: user => `${user.name} (private)`,
        commandHint: 'bun cli outline',
        userLanguage: 'Polish',
    }),
});
```

- `outline login`, `outline pull` (a full pull that finishes the first download), `outline sync` (pull, push, sharing) and `outline hook <session-start|prompt|stop|session-end>` for Claude Code hooks.
- The documents (`documents/`, `recovered/`) live in the repo's main checkout and the state in `<git-common-dir>/outline-sync/`, so every worktree shares one sync.
- Only session start and prompt pull (a prompt at most once a minute, a full pass every 15 minutes); stop and session end push. Both skip quietly while another session syncs.
- `hook` always exits 0. It prints `additionalContext` for the agent, or a Stop block once for a conflict its push created; a missing login or an unreachable Outline is told once per session, other failures go to `hook.log` in the state directory.

## fakeOutline

```ts
import { fakeOutline } from '@nzyme/outline/outline/fakeOutline.js';

const outline = fakeOutline();
const ana = outline.addUser({ name: 'Ana' });
const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
const doc = outline.addDocument({ collection: wiki, title: 'Offer', text: 'Hello', createdBy: ana });

const client = outline.clientAs(ana);
```

It implements the endpoints the client calls, with per-user visibility (collection permissions, private collections, drafts, direct document shares for users and groups), `revision` counters, `lastRevision` conflicts, archive, a pluggable text normalizer (`normalizeText`) and `injectRateLimit`. The Outline behaviour lives in functions named after the rule they model (`canReadDocument`, `matchesFilters`, ...), so a difference found against real Outline is fixed in one place.
