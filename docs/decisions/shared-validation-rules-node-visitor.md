# Shared validation rules: a node-rule + visitor mechanism, not a schema or a model library

> Recorded in the consuming healed monorepo, where nzyme is a git submodule, and moved here because the decision is about nzyme. Mentions of Healed describe the consumer the decision was made for.

## Status

Accepted

## Context

Workflow run rules existed twice and had drifted. `validateWorkflow` (`packages/workflows-common/src/validateWorkflow.ts`)
fed the build, the studio's problems bar and the workflow list's problem count. Independently, the
canvas step editors carried their own `vue-forms` validators inherited from doctor-app —
`requiredValidator`, a `translationValidator` that checks only the current UI language,
`useStepRefValidator`, `minLengthValidator`. The two sets had already diverged: translations (current
language vs every supported language), a missing `nextStepId` going unreported on the canvas, id
uniqueness and format, and `productUid` format.

The root cause is general, not specific to workflows. Backend validation in this codebase is an
imperative, one-shot tree walk; frontend validation is deliberately reactive and emergent from the
component tree, because a step's fields and their editors mount and unmount as the author navigates
the canvas. A model-predefined validation approach (vuelidate, regle) binds rules to a schema shape
decided up front, which collapses once fields are nested, conditional, or keyed by a union discriminant
like `WorkflowStep['type']` — exactly the shape run rules need to check. The same split reached the
primitives: `@nzyme/validation`'s `required`/`minLength`/… and `@nzyme/vue-forms`'s
`requiredValidator`/`minLengthValidator`/… existed as two unrelated implementations with different
messages and edge-case semantics (e.g. whether an empty array satisfies "required").

A predecessor already tried the schema-driven route and failed: `zchema` (`packages/zchema` in the
`nzyme` submodule, deleted in commit `fcc15938`, 2026-08-31) hung validation rules off the schema
definition itself. Its recursive, schema-derived key types blew up in both inference time and error
messages as nesting grew — the same mechanism this task needed to avoid repeating.

## Options Considered

- **Zod `superRefine` on `WorkflowConfig`.** Add run-rule checks as refinements on the existing file
  schema. Trade-off: the file schema is deliberately permissive (an in-progress, half-filled workflow
  must still parse and save), so bolting run rules onto it mixes two different validity notions in one
  place. It also gives no way to scope validation to the one step a component renders, and no way to
  pass a per-call language — `superRefine` has no reactive or per-node entry point.
- **Model-based Vue validation libraries (vuelidate, regle).** Define the whole form's rules against
  one static schema, matching the library's own validation model to the data shape. Rejected for the
  reason above: the schema needed here is a discriminated union with per-type branches and nested
  arrays, which these libraries don't scope or key per-component, and they offer no server-side
  counterpart to run the same rule outside Vue.
- **Project the backend validator's errors onto form fields.** Run `validateWorkflow` once and route its
  flat error map onto whichever fields are mounted. Works for a single-document editor, but takes
  control of error routing and show/hide behavior away from the components that own the fields, and
  doesn't generalize to a tree where only one step out of many is mounted at a time.
- **A node-rule + visitor mechanism**, explored as three designs in a Design-It-Twice pass before
  picking a direction:
  - **A — minimal interface:** a rule is `(node, ctx, visit) => void`; visitor keys are untyped
    strings; field state keys are private. Smallest surface, but untyped keys reintroduce the typo
    class of bug the mechanism exists to remove.
  - **B — maximum flexibility:** a six-method visitor (separate sink/focus/basePath operations), a
    framework-agnostic `routeErrors` usable outside Vue, reactive aliased keys. Most powerful, but the
    surface is bigger than any current caller needs, and the framework-agnostic indirection has no
    second consumer to justify it.
  - **C — common case:** a typed visitor (`field`/`nested`/`each`/`error`), a public field key, and step
    rules attached once by the form builder rather than by each step component. Covers the actual
    shape of workflow rules (discriminated union of step types, nested conditions, arrays of options)
    with the smallest API that stays type-safe.

## Decision

Build the mechanism as a hybrid led by design C, in `@nzyme/validation`:

- **Atomic validators** keep the existing shape, `Validator<T, C> = (value, ctx) => ValidationResult`.
- **Node rules** are `Rule<T, C> = (node, v, ctx) => void`, where `v` is a `RuleVisitor<C>` typed only
  one `keyof` level deep (`field`, `nested`, `each`, `error`) — never a recursive, schema-derived type.
  That restriction is the direct lesson from `zchema`: a rule's own key types stay small and stable no
  matter how deep the tree gets, because each rule only ever describes its own node and delegates to a
  child rule for the next level.
- **`validateRules(value, rule, ctx, { stopAt })`** is the deep, synchronous walker. It returns
  `ValidationErrors` keyed by dotted path, and `stopAt` prunes a subtree (and drops its messages)
  without the walker needing to know why — the caller states its own boundary explicitly, there is no
  magic "a nested `useRules` lives here" detection.
- **Rules are pure functions of `(node, ctx)`.** Anything that spans more than one node — which step
  ids exist, who owns an id first for duplicate detection — is computed once and passed through `ctx`,
  never read from outside the node. This is what lets the same rule run as one deep walk on the backend
  and as a reactive, per-node check in a mounted Vue component: a rule never needs to know which mode
  it's running in.
- **Messages are already-translated strings** produced by the rule itself via `ctx.lang` and a
  `.loc.yaml`. There is deliberately no error code or message catalog: only the rule that detects a
  condition knows how to phrase, interpolate and pluralize it correctly, and a catalog would just move
  that knowledge to a second place that has to stay in sync with the first.
- **`@nzyme/vue-forms`'s built-in validators become thin wrappers** over the same primitives — their
  public API (`requiredValidator()`, `minLengthValidator({ minLength })`, …) is unchanged, only the
  logic and default message move to `@nzyme/validation`.
- **`useRules(form, rule, { ctx, stopAt })`** (`packages/vue-forms/src/useRules.ts`) attaches a
  rule to any existing form node. It re-runs the rule reactively, then routes each message by its
  dotted path to the deepest addressable field under that path — an alias field (no key, no value of
  its own) receives its parent's path, and a message with no matching field falls back to its nearest
  addressable ancestor, ultimately the node `useRules` was called on. Routed messages behave like any
  other validator error on that field (show-on-blur, counted by `validate()`), and the full list is
  always available via `FormValidatorState.messages` regardless of `show` — the problems bar reads that
  list, not just what's currently visible. Every `useRules` registration also feeds `FormModel.ruleErrors`,
  which aggregates all rule messages of a node's subtree whether or not those fields are rendered.
- Workflow rules (`packages/workflows-common/src/rules/`) are organized the same way as the data they
  check: `stepRules` switches on `step.type` with `assertNever` in the `default` case, `conditionRules`
  switches on `condition.type`, and cross-node facts live in `WorkflowRulesContext`
  (`createWorkflowRulesContext.ts`), built once per edit from the whole workflow. `validateWorkflow` is
  now a one-line call into `validateRules` with that context.
- In the studio, the root form registers `workflowRules` with `stopAt: ['steps']`
  (`packages/studio/workflows/WorkflowBuilderContext.ts`), and each step's own view model registers
  `stepRules` on its own form field — not the step's editor component — specifically so a step's rule
  messages exist and roll up into the root's `ruleErrors` whether or not that step's node is currently
  selected and mounted on the canvas. The problems bar reads `ruleErrors` from the root instead of
  re-running a separate full validation pass, so Vue's reactivity re-runs only the rule of the node that
  actually changed.

## Consequences

One rule set now drives the build, the workflow list's problem count, the studio's problems bar, and
inline field errors on the canvas — `packages/studio/problems/WorkflowProblems.spec.ts` asserts the
builder's aggregated `ruleErrors` equals `validateWorkflow`'s deep result for the same file, so the two
paths cannot silently diverge again. Rule keys are typed, removing the typo class of bug the untyped
design (A) would have kept. The build now also enforces checks that previously existed only in the
canvas editors — `productUid` format, required age/gender conditions on a condition router.

Costs accepted with the decision:

- `useRules` creates one extra validator state per field that receives routed messages.
- A field with its own value and no key is opaque to routing: `useRules` messages addressed to it never
  reach an ancestor's `ruleErrors`. Any field a rule needs to address must be given a key.
- Routing by array index inherits the pre-existing index-shift-on-delete behavior of keyed array fields;
  this task did not change it.
- Async rules are not supported — a rule that needs an await (e.g. "this product exists in the
  database") is out of scope for this mechanism and must be checked elsewhere, the same limitation
  `vue-forms`'s own async validators already have for a field's own value.
