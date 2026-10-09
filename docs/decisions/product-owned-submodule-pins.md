# Product-owned submodule pins

## Status

Accepted

## Context

Products build nzyme from source as a git submodule. A gitlink is an exact pin, but the main
consumer's automation moved it to the tip of nzyme `main` on every push, without running the
product's tests first. A change in nzyme could therefore reach production only because a ref moved.

The first answer was per-product refs in nzyme (`healed/main`, `healed/release`): the product's CI
would fast-forward them to the commit its branch pins, using a token stored in the product. Review
showed the cost of that token. A fine-grained PAT cannot be limited to branches, so a token with
contents write on nzyme can push anywhere in nzyme, including `release`, and a push to `release`
publishes to npm. Every product would hold a credential to the shared library.

## Options Considered

- **Option A — per-product refs in nzyme, advanced by the product.** Visible from nzyme which commit
  each product runs. Trade-off: every product stores a write token to nzyme. Rulesets and a protected
  npm environment narrow the damage, but they do not remove the credential.
- **Option B — a fork per product.** The product's token writes only to its fork. Trade-off: the fork
  must be synced continuously, nzyme PRs go fork → upstream, and the tooling that assumes a
  submodule's PRs live in its `origin` needs rework. Strong isolation, at a daily cost.
- **Option C — the product owns its pin; nzyme holds no product state.** The gitlink in the product
  is the record. Bumps are PRs in the product, gated by its CI. Production branches move only by the
  product's own promotion. Trade-off: nzyme itself cannot show what each product runs — the product's
  history and its bump PRs do.

## Decision

Option C. The gitlink already records exactly what each product branch runs, so mirroring it into
nzyme added state, automation and a credential without adding information.

- `@nzyme/cli` keeps `submodule bump` and nzyme keeps the reusable `consumer-bump.yml`, which writes
  only to the product.
- `submodule mirror`, `consumer-mirror.yml`, the `<consumer>/*` refs and `forward-port.yml` are
  removed.
- The rules a product follows — exact-pin checkout, automatic bumps on `main` only, reachable pins,
  the hotfix flow — are in [docs/consumers.md](../consumers.md).

## Consequences

- **Gained:** no product holds a credential to nzyme; nothing to keep in sync; a product's production
  pin changes only with a commit on its own production branch.
- **Accepted:**
  - An nzyme fix reaches production only through the product's `main`, so it ships together with
    every nzyme change pinned there since the production pin.
  - Keeping production branches free of automated bumps is the product's discipline, backed by its own
    guard rails (a deploy-time assertion and a required check on production PRs), not something nzyme
    can enforce.
