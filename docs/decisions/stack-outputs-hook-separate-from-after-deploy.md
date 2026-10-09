# Stack `outputs` hook, separate from `afterDeploy`, and `bun infra output`

> Recorded in the consuming healed monorepo, where nzyme is a git submodule, and moved here because the decision is about nzyme. Mentions of Healed describe the consumer the decision was made for.

## Status

Accepted

## Context

Values a deployed runtime needs — database credentials, Cognito pool ids, the DynamoDB table, the
audit Firehose stream — are Pulumi stack outputs. Each stack's `afterDeploy` hook wrote the subset a
local process needs into gitignored, package-local files (`packages/cli/.env.<ENV>`,
`packages/patient-app/.env.<ENV>`, etc.). A checkout that never deployed an environment, or one that
merged a branch adding a new such file, has none of them, and every local command touching that
environment fails with `Environment variable X is not set` / `Runtime config key X is not set`.

The only way to regenerate them without a real deploy was `bun infra deploy <stacks> --skip-resources`, which runs every selected stack's `build()` and its full `afterDeploy` — not just
the local file write. `afterDeploy` also carries every remote side effect: DB user reconciliation and
schema push, S3 uploads, CloudFront invalidation, a CI image push, and on release environments a Slack
notification plus Linear comments/tag. Running it just to read config meant accepting all of that, plus
`FORCE_BRANCH=true` on any branch other than the environment's deploy branch and, for the database
stacks, Tailscale connectivity — even when the goal was config for a stack that needs neither.

## Options Considered

**A. Keep using `deploy --skip-resources`.** No code change, but every regeneration still pays for
`build()` and the full `afterDeploy` of each stack, needs `FORCE_BRANCH` off the deploy branch, needs
Tailscale even for config that never touches the database, and fires the release-env Slack/Linear hook
on every run.

**B. A dedicated `outputs` stack hook, and an `output` command that runs only it.** Stacks declare
`outputs(output, deps)` as local-only consumption of their deployed outputs, distinct from
`afterDeploy`. A deploy (including `--skip-resources`) runs `outputs` then `afterDeploy`, as before.
A new `bun infra output [stacks…]` command fetches the currently deployed outputs of the selected
stacks and runs **only** their `outputs` hooks — no `build()`, no `afterDeploy`, no resource changes.

## Decision

B. Local file writes moved out of every Healed stack's `afterDeploy` into the new `outputs` hook, and
`bun infra output` became the entry point for regenerating local config from an already-deployed
environment (`packages/pulumi/src/defineStack.ts`, `cli/definePulumiCommands.ts`,
`syncStackOutputs.ts`, `selectStack.ts`).

## Consequences

- **Hook contract.** `outputs` may only have local effects (write gitignored config files); anything
  that touches remote state or an external service — DB reconciliation, uploads, invalidation,
  notifications — stays in `afterDeploy`. A deploy runs `outputs` then `afterDeploy`, in that order,
  for both a normal deploy and `--skip-resources`.
- **Serialized per run.** `outputs` hooks run one at a time within a single command invocation (a
  shared semaphore), even though stacks deploy concurrently. This also closes a latent lost-write race:
  several stacks read-modify-write the same file (e.g. `packages/cli/.env.<ENV>`), and running those
  hooks concurrently under the old `--skip-resources` path could drop one stack's write under another's.
- **`output` never creates a stack.** It selects an existing stack (`selectStack`, never
  `createOrSelectStack`); a stack that was never deployed is skipped with a warning instead of being
  created empty. It also skips the branch assertion in `beforeEach` — it never touches AWS resources or
  Pulumi state, so `FORCE_BRANCH` and Tailscale (beyond what's needed to reach the database itself) are
  no longer preconditions for regenerating config.
- **`--print`/`-p`** fetches and prints the outputs (including secrets) instead of running hooks, for
  inspecting values without writing files.
- **Downside:** stack authors must place every new local-only effect in `outputs` and every remote
  effect in `afterDeploy` — putting a file write in `afterDeploy` makes it unreachable from `bun infra
  output`, and putting a remote effect in `outputs` would make `bun infra output` trigger side effects
  it is not supposed to have.
