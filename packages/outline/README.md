# @nzyme/outline

A typed client for the [Outline](https://www.getoutline.com) API, and `fakeOutline`, an in-memory Outline for tests.

## Client

```ts
import { OutlineClient } from '@nzyme/outline/OutlineClient.js';

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

## fakeOutline

```ts
import { fakeOutline } from '@nzyme/outline/fakeOutline.js';

const outline = fakeOutline();
const ana = outline.addUser({ name: 'Ana' });
const wiki = outline.addCollection({ name: 'Wiki', permission: 'read_write' });
const doc = outline.addDocument({ collection: wiki, title: 'Offer', text: 'Hello', createdBy: ana });

const client = outline.clientAs(ana);
```

It implements the endpoints the client calls, with per-user visibility (collection permissions, private collections, drafts, direct document shares for users and groups), `revision` counters, `lastRevision` conflicts, archive, a pluggable text normalizer (`normalizeText`) and `injectRateLimit`. The Outline behaviour lives in functions named after the rule they model (`canReadDocument`, `matchesFilters`, ...), so a difference found against real Outline is fixed in one place.
