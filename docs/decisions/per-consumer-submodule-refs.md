# Per-consumer submodule refs advanced after the product's CI

## Status

Accepted

## Context

Products (e.g. Healed, in the `sigma` repository) consume nzyme as a git submodule: `nzyme/packages/*`
are part of their workspaces, built from source, never installed from npm. The product's commit
records a **gitlink** — the exact nzyme commit — so the pin itself is precise.

What moves the pin is not. The product's automation (`update-submodules.yml` and
`verify-submodule-refs.ts` in sigma) moves the gitlink to the tip of nzyme's `main` on every push to
the product's `main` and pushes that straight back, without running the product's tests on the new
nzyme. Pull requests are checked against "the latest commit on nzyme `main`" too. So a change merged
into nzyme — tested only against nzyme's own suite — reaches the product's `main`, and from there its
production, because a ref moved and not because anyone verified the product still works with it.

nzyme also has no record of which of its commits a product actually runs. A fix for one product's
production has to be reconstructed from that product's gitlink history, and there is nowhere in
nzyme to land it without dragging in everything merged to `main` since.

nzyme's own release line (`release`, published to npm) is unrelated: it governs npm versions, which
these products do not install.

## Options Considered

- **Option A — track nzyme `main`'s tip automatically (status quo).** Every product follows `main` as
  it moves. Trade-off: zero ceremony and fast co-development, but nzyme changes reach a product
  untested by that product's CI, and nzyme cannot say what each product runs.
- **Option B — pin products to npm-published versions or release tags only.** A product moves only
  to a tagged nzyme release. Trade-off: every pin is a reviewed, versioned point — but co-developing a
  feature across both repositories now waits for a release, and the products do not install nzyme from
  npm at all, so a tag would be a second, parallel notion of "version" with no tooling behind it.
- **Option C — per-consumer refs advanced fast-forward after the product's CI.** nzyme carries
  `<consumer>/main` and `<consumer>/release` (e.g. `healed/main`), each naming the nzyme commit the
  product's branch of that name pins. A product moves nzyme through a bump PR, which its CI gates; when
  that lands and CI is green on the product's branch, the product's automation fast-forwards the ref.
  Trade-off: a little machinery (two CLI commands, three workflows) and an explicit failure when a
  product rolls nzyme back — in exchange, nothing reaches a product without its CI, and nzyme knows
  exactly what each product runs.

## Decision

Option C.

The refs are moved only by the product's automation (`nzyme submodule mirror`, wrapped in the
reusable `consumer-mirror.yml`), only after the product's CI passed on the commit whose gitlink is
mirrored, and only by fast-forward. A gitlink that does not descend from the ref — a rollback or a
divergence — fails the job loudly and leaves the ref where it is. Nothing ever force-pushes a
consumer ref; rewinding one is a deliberate human act.

Moving nzyme forward in a product is a pull request (`nzyme submodule bump`, wrapped in
`consumer-bump.yml`), so the product's CI is the gate. nzyme ships the building blocks only; each
product decides its cadence, its source ref and whether a green bump merges itself.

A hotfix for one product's production is a PR into nzyme's `<consumer>/release`. nzyme then opens a
forward-port PR `<consumer>/release → main` (`forward-port.yml`) that must be merged with a merge
commit, so the hotfix commit itself becomes an ancestor of `main` and the next fast-forward of
`<consumer>/release` from `main` stays possible.

nzyme's npm release line (`release`, `promote.yml`, `release.yml`, `back-merge.yml`) is separate and
unaffected.

## Consequences

- Every nzyme change reaches a product through a PR that the product's CI ran on. A base-library
  regression is caught in a bump PR, not discovered in production.
- `git log healed/release` in nzyme is what Healed runs in production; a hotfix branches from exactly
  that.
- A product that rolls nzyme back gets a failing mirror job until someone resolves it by hand —
  intended: a rollback is rare and worth a human look, and the alternative is silently rewinding a ref
  other work builds on.
- Hotfixes need the forward-port merged with a merge commit, in a repository whose pull requests are
  otherwise squash-merged. The PR body says so; a squash there would leave `<consumer>/release`
  diverged, which the next mirror would refuse.
- Between merging a hotfix into `<consumer>/release` and the product's release bump landing, the ref
  is ahead of what the product pins; the product's release mirror is then a no-op.
- The products' existing "nzyme must be at `main`'s tip" automation and PR check have to go — they
  are what this replaces.
