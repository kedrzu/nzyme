# @nzyme/outline

A typed client for the [Outline](https://www.getoutline.com) API, and `fakeOutline`, an in-memory Outline for tests.

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
