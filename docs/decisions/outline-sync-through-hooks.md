# Outline sync through Claude Code hooks

## Status

Accepted

## Context

`@nzyme/outline` keeps an Outline workspace and a local Markdown folder in step, so that people and
an agent working in Claude Code edit the same documents as their partners editing in Outline. Four
choices shaped it: what process runs the sync, how changes are found, how a user signs in, and where
the state and the merge live.

> **Checked 2026-11-20** on Outline Cloud with a live script: OAuth 2 authorization code with PKCE
> S256 works for a public client registered with the redirect `http://127.0.0.1/callback`, with the
> CLI listening on a random port; scope `read write` allows create, update, move, archive and
> attachments; a refresh rotates the refresh token.

> **Checked 2026-11-20:** `documents.list` takes `filters` on `collectionId` and `updatedAt`
> (`eq`, `gt`), and its items include `text` and `revision`, so one page carries the content.
> `limit` 100 with `offset` paging works. A collection created seconds earlier returned no documents
> for about a minute under every filter; a minute later the same queries returned them.

> **Checked 2026-11-20:** `documents.update` with a stale `lastRevision` answers 409. With identical
> text, a simple document keeps its revision, but a complex one (tables, lists, hard break) gains one
> revision on every write. Writes are normalized (`-` bullets to `*`, table separators, `_italic_` to
> `*italic*`, hard breaks, blank lines) and converge after two writes.

> **Checked 2026-11-20:** attachments go through `attachments.create`, which returns an S3 presigned
> POST (204 on upload); the link `/api/attachments.redirect?id=…` is kept verbatim in the text and
> redirects to a signed URL with the same bytes. Sharing with a second user was not tested live.

> **Read 2026-11-20** in Outline v1.13.0 (`outline/outline`): `events.list` has no date or id filter
> and a non-admin must pass a document or collection, so members have no change feed; webhooks are
> admin-only; documents have no frontmatter (a leading `---` becomes a horizontal rule); API keys are
> per user, and members may create them only if the admin enabled `MembersCanCreateApiKey`; the
> limits are 100 requests per 60 s, 25 for create calls, answered with 429 and `Retry-After`.

## Options Considered

Process model. Three designs were compared:

- **A — minimal interface: hooks only, a compiled binary.** Trade-off: nothing to supervise, but
  distributing a binary is its own cost.
- **B — maximal flexibility: a launchd daemon plus hooks, three packages.** Syncs while Claude Code is
  closed. Trade-off: a process to install, supervise, update and debug on non-technical users'
  machines, for a folder nobody reads while Claude Code is closed.
- **C — common case: hooks only, Bun and npm.** Trade-off: no sync outside a session.

Discovery:

- **Full listing every time.** Trade-off: simple and detects everything, but a workspace of hundreds of
  documents costs several of the 100 requests per minute on every prompt.
- **Incremental `documents.list` with `updatedAt gt`, plus a periodic full pass.** Trade-off: an
  incremental pull does not see archive, deletion, lost access, membership changes or a new
  collection (a membership change does not move `updatedAt`).

Authentication:

- **Per-user API keys.** Rejected: members must find the setting, and the admin must allow member keys.
- **OAuth with dynamic client registration.** Rejected: depends on the workspace's MCP preference staying on.
- **OAuth 2 authorization code with PKCE, a public client created once by the admin, loopback redirect.**
  Trade-off: one admin step, then a browser login per user.

State and merge:

- **State in the documents folder or in git.** Rejected: shared with partners or mixed into their history.
- **Own merge.** Rejected: `git merge-file` is already required on every machine that has the repo.

## Decision

- **Hooks only (design C).** The sync runs at SessionStart, UserPromptSubmit, Stop and SessionEnd,
  each hook with an explicit timeout; Stop has 60 s and the hook keeps its own run within 40 s. Nobody
  reads the folder while Claude Code is closed, and the push at Stop meets "in Outline by the end of
  the turn".
- **Discovery.** An incremental pull (`documents.list` with `updatedAt gt` the last pull, 1 to 2
  requests) at most once a minute on a prompt, and a full pass at session start and every 15
  minutes; only the full pass detects archive, deletion, lost access, documents newly shared with
  the user and new collections. Content never unchanged is sent, because a complex document gains a revision on
  every identical write.
- **Auth.** OAuth 2 authorization code with PKCE, a public admin-created client with the redirect
  `http://127.0.0.1/callback` (loopback URIs match any port). Tokens are written to the keychain
  directly, not through `defineSecret`: Outline rotates the refresh token, and a replay of a stale
  one revokes the whole grant, so a read-then-refresh-then-store must happen under one lock.
- **State and merge.** State lives in `<git-common-dir>/outline-sync/`, so every worktree of a clone
  shares one sync and git never tracks it. Local edits merge with Outline's through `git merge-file`
  against a base that is Outline's returned text after each write, not the text sent, because
  Outline normalizes what it receives; the base then matches what the next read returns.
- **Sharing.** `outline share|unshare|shares <file>` call Outline's membership endpoints and print the
  document's direct shares. Files hold no share list, so nothing polls memberships to keep one equal.

## Consequences

- Nothing syncs while Claude Code is closed, and nothing is pulled in the middle of a turn; a
  partner's edit made during a turn arrives at the next prompt.
- A new collection, an archive in Outline or a document newly shared with the user shows up locally
  after the next full pass, up to 15 minutes later.
- Setup needs one admin step (the OAuth app) and one login per user; no API key handling.
- A file's form may change after a push (normalization), which the base text absorbs.
- Revisit if partners need sync with Claude Code closed (design B) or Outline offers members a change
  feed.
