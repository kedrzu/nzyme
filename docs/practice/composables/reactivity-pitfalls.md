# Reactivity pitfalls

Four independent gotchas in otherwise-correct composables — each a real failure mode, not a style
preference.

## Watchers must handle a reset to `null`

When a watched value can be cleared (a form reset sets a field to `null`), handle the `null` case —
usually by resetting local state to its default. A guard that only handles non-`null` leaves local state
stale, and the next edit can write the stale value back, silently undoing the reset.

- Bad: `watch(() => field.value?.unit, u => { if (u != null) selectedUnit.value = u; })`
- Good: `watch(() => field.value?.unit, u => { selectedUnit.value = u ?? 'KG'; })`

## Keyed fetches: `useDataSource`, not `computedAsync` or a hand-rolled `watch`

`computedAsync` (`@nzyme/vue-utils/computedAsync.js`, or the `@vueuse/core` one) keeps the previous
result while a new evaluation is in flight, so when the key changes the UI briefly shows the old record
under the new id. It also has no error state: a rejection reaches only an `onError` callback if you
passed one.

`useDataSource` (`@nzyme/vue-utils/useDataSource.js`) reloads on `params` change and exposes reactive
`value`/`pending`/`error`. On a true identity switch call `clear()` in a `watch` on the id; for a
same-subject refresh call `invalidate()`, which keeps the old value visible.

- Bad: `const owner = computedAsync(() => getUser(props.ownerId));` — the previous owner lingers across
  id changes, errors vanish
- Good: a `useDataSource` keyed on `ownerId`, with `clear()` when the id changes

## `mapScopedArray` instead of effects inside `array.map()`

A composable that registers effects (`onScopeDispose`, `onWindowEvent`, watchers, …) called inside
`someReactiveArray.map(...)` binds every effect to the component's scope and freezes the registrations
to the array's length at setup time. When the array changes, old effects leak and new items get none.

`mapScopedArray(() => arr, item => ...)` (`@nzyme/vue-utils/mapScopedArray.js`) runs each item's mapping
in its own child effect scope and stops the surplus scopes when the array shrinks. It tracks only the
array's **length** — each result is tied to an index, so read the element by index inside the mapping
(e.g. through a `computed`) if it must follow value changes. `useFormFieldArray` is built on it.

- Bad: `const shortcuts = props.buttons.map(b => useKeyShortcut(b.key));`
- Good: `const shortcuts = mapScopedArray(() => props.buttons, b => useKeyShortcut(b.key));`

## No `isBrowser()` guards in browser-only code

Stores, composables and services with no server-side rendering path shouldn't guard against
non-browser contexts. `isBrowser()` (`@nzyme/dom-utils/isBrowser.js`) is for code that genuinely runs
on both sides; elsewhere it adds nothing at runtime and forces tests to stub `window` just to reach the
real code. If code truly runs on both sides, split it; otherwise let it assume a browser.
