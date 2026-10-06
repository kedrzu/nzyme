# Shared validation rules

## Rule or field validator?

|Situation|Use|
|-|-|
|Validation that exists only in this form's UI|Field validators in `useFormFields` (the forms `SKILL.md`)|
|The same business rule must also run elsewhere — on the backend, in a build step, in several forms|A rule from `@nzyme/validation`, run with `validateRules` outside Vue and `useRules` in a form|

Write the rule once with `defineRule` (`@nzyme/validation/rules/defineRule.js`) in the package that owns
the data, not in the Vue form that happens to edit it.

## Rule shape

A rule is `(node, v, ctx) => void`. The visitor `v` has four operations, typed one `keyof` level deep on
purpose — a rule only describes its own node:

- `v.field(node, 'key', ...validators)` — runs validators from `@nzyme/validation/validators/`
  (`required`, `email`, `minLength`, `minValue`, `maxDate`, `regex`, …) on `node.key` and reports at
  that key. All validators run; none short-circuits.
- `v.nested(node, 'key', childRule)` — descends into an object child; skipped when it is null.
- `v.each(node, 'key', itemRule)` — descends into each array item, reporting at `key.<index>`.
- `v.error(key, message)` — reports a message directly (`null` key = the current node), e.g. from a
  `switch` branch that maps to no single validator.

```ts
import { defineRule } from '@nzyme/validation/rules/defineRule.js';
import type { ValidationContext } from '@nzyme/validation/Validator.js';
import { email } from '@nzyme/validation/validators/email.js';
import { minValue } from '@nzyme/validation/validators/minValue.js';
import { required } from '@nzyme/validation/validators/required.js';

export interface OrderRulesContext extends ValidationContext {
    knownSkus: ReadonlySet<string>;
}

export const orderLineRule = defineRule<OrderLine, OrderRulesContext>((line, v, ctx) => {
    v.field(line, 'quantity', required(), minValue(1));
    if (!ctx.knownSkus.has(line.sku)) {
        v.error('sku', translateToString(l.unknownSku, ctx.lang ?? 'en'));
    }
});

export const orderRule = defineRule<Order, OrderRulesContext>((order, v) => {
    v.field(order, 'customerEmail', required(), email());
    v.each(order, 'lines', orderLineRule);
});
```

- For a discriminated union, `switch` on the discriminant and call `assertNever` in `default`.
- Anything beyond the rule's own node — ids that exist elsewhere in the document, who owns what — comes
  through `ctx`, never a closure over outside state. Build the context once per edit from the whole
  document.
- Messages are already-translated strings the rule produces from `ctx.lang` through a `.loc.yaml`
  (translations skill). There is no error-code catalog: the rule that detects the problem is the only
  place that can phrase, interpolate and pluralize it correctly.

## Running a rule

- **Outside Vue** — `validateRules(value, rule, ctx, { stopAt })` from
  `@nzyme/validation/rules/validateRules.js`: a deep, synchronous walk returning `ValidationErrors`
  keyed by dotted path (`lines.2.quantity`), or `null` when valid.
- **In a form** — `useRules(form, rule, { ctx, stopAt })` from `@nzyme/vue-forms/useRules.js` attaches
  the rule to any form node: a `useForm` root or a `useFormField`/`useFormFields` field. Without `ctx`
  the rule gets `{ lang: form.lang }`. It re-runs reactively and routes each message to the deepest
  field whose key path matches. The registration lives as long as the calling effect scope.

Routing:

- A field receives routed messages only if it is **addressable** — declared through
  `useFormFields`/`useFormFieldArray` (it has a key) or given an explicit `key`. A field with its own
  value and no key is opaque; its messages fall back to the nearest addressable ancestor, ultimately the
  form.
- An **alias** field (no key, same path as its parent) receives its parent's messages — route a rule's
  node-level error onto the field that represents "the whole node" in the UI.
- A routed message then behaves like any validator error: shown on blur or submit, counted by
  `valid`/`invalid`/`validate()`.
- `FormValidatorState.messages` holds every message regardless of whether it is shown — read it for a
  field's full list.
- `form.ruleErrors` aggregates every `useRules` registration on a node and its addressable subtree —
  read it for a "problems below here" list instead of calling `validateRules` again.

## `stopAt`

Pass `stopAt: ['lines']` (`'*'` matches exactly one segment: `'lines.*.options'`) when a subtree has
its own `useRules` lower down, so the parent's rule doesn't validate it twice. Nothing detects this
automatically — state it at the call site that knows about the nested registration.

## Attach rules where the data lives

Attach an item's rule where its view model is created, not inside the component that renders it.
Otherwise the rule exists only while that component is mounted, and an item that is scrolled away or
not selected silently drops out of `ruleErrors`.

## Limits

- Routing is by key, so array items inherit the index-shift-on-delete behavior of keyed array fields.
- No async rules — a server-dependent check belongs in the submit handler.
