# Pinning nzyme in a product

A product that builds nzyme from source as a git submodule owns its pin: the gitlink in the product's
own history is the only record of which nzyme commit each product branch runs, and only the product
moves it. nzyme holds no product state and products hold no credentials to nzyme. Why:
[the ADR](decisions/product-owned-submodule-pins.md). Setting the submodule up in the first place
(workspace, build, lint, format): [submodule-setup.md](submodule-setup.md).

## Rules

1. **Production runs exactly the pin.** Every checkout that builds or deploys uses the gitlink of the
   commit being built: `actions/checkout` with `submodules: recursive`, or
   `git submodule update --init`. Never `--remote`, never `git submodule foreach … pull`, never a
   `branch =` in `.gitmodules` that a script follows. Assert it before building (see below).
2. **Pins move in the product's PRs, never by automation.** The product moves the pin to the latest
   nzyme `main` inside its own task PRs, where its tests run (see below); nothing bumps it on a
   schedule or merges a bump by itself. Branches that deploy to production (`release`, hotfix
   branches) receive a new pin only through the product's promotion — a merge from `main` brings a
   pin `main` has run.
3. **Production runs only pins `main` has run.** A pin reaches a production branch only after it was
   the pin of the product's `main` at some point, so the product's CI and its non-production
   environments have run it. Pins on nzyme `main` also stay reachable; a commit reachable only from a
   deleted branch is garbage-collected, and the pin then points at nothing.

## Guard rails in the product

- **Deploy-time assertion.** Right before a production build, fail when the checked-out submodule
  differs from the pin — `git submodule status` prefixes such a submodule with `+` (or `-` when it
  is missing). Deploys to non-production environments may warn instead, so a working tree can still
  be deployed while debugging:

  ```sh
  if git submodule status --recursive | grep -q '^[-+U]'; then
      git submodule status --recursive
      echo "Submodule checkout differs from the pinned commit" >&2
      exit 1
  fi
  ```

- **A required check on PRs into the production branch** that fails when the PR's nzyme pin was never
  the pin of the product's `main` (rule 3) — e.g. collected from `git log -p origin/main -- nzyme`.
  A promotion from `main`, or a rollback to an older `main` pin, passes even after `main` has moved
  on. The check also lists the nzyme commits between the old and the new pin, which a PR diff shows
  only as `Subproject commit a → b`.

## Moving the pin

The product's task workflow moves the pin in every PR that lands on its trunk: it sets each
submodule resting on the trunk to the tip of nzyme's `origin/main` and commits the gitlink with the
PR's other changes. A submodule on its own task branch gets nzyme `main` merged into that branch
instead; a PR that does not land on the trunk (a hotfix into `release`) leaves the pin alone. The
product's tooling decides when (task start, switching to a PR, push, ready); in nzyme's own
`bun task` CLI (`@nzyme/linear`, `@nzyme/github-cli`) that is task start, a switch to an existing PR,
and `push`, `ready` and `refresh`.

Why in the PR and not on a schedule: the product's tests select by the diff against the base branch
(`nzyme git affected`), on the premise that everything already on the base was tested in its own PR.
A pin that reaches the trunk through a PR whose CI runs no tests puts untested nzyme on the base and
breaks that premise. In a task PR the gitlink change is expanded into the changed nzyme files, so the
PR's tests cover the new nzyme code. `bun.lock` records each workspace package's version and
dependencies, so a moved gitlink needs a regenerated lock: when a `bun task` sync moves a gitlink in
a product with a `bun.lock`, it runs `bun install --lockfile-only` and commits and pushes the lock
on its own, before the PR's CI installs with `--frozen-lockfile`.

Working on nzyme from inside the product does not change this: the nzyme change is a PR to nzyme,
and the product's PR pins the merged commit (or the next task PR moves the pin).

## Hotfix for a product's production

An nzyme fix reaches production the way every pin does — through the product's `main`:

1. Fix it in nzyme with an ordinary PR into nzyme `main`.
2. Land it in the product's `main`: the next task PR moves the pin to nzyme `main`.
3. Promote that pin to the production branch with the product's release, or with a product hotfix
   PR that sets the pin to the one `main` now runs. It brings every nzyme change between the old and
   the new pin — the required check lists them.
