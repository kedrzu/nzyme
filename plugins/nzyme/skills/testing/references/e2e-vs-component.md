# E2E journey or component test

Read before choosing between a Playwright e2e test and a component test.

**E2E covers whole user journeys; a component test covers one component's behavior.** Wrong in either
direction costs: a widget's validation matrix driven through login and a real backend is slow and
flaky, while a real journey dissolved into isolated component tests never proves the layers connect.

## E2E — journeys a user performs across UI and backend

- **Complete CRUD lifecycles** the way a user drives them: create, see it in the list, edit, delete.
- **Multi-page flows:** sign in, do something, see the result on another screen.
- **Authentication** and session persistence.
- **Role and permission boundaries as the UI shows them:** one role sees and uses an action, another
  is refused. This round-trip through real backend enforcement is what earns a browser test.
- **Persistence and live sync:** reload and re-verify; two browser sessions seeing each other's updates.

The goal is to cover the journeys users actually take, not to minimise the number of browser tests.

## Component test — one component in isolation

- Field validation rules and their exact error text; submit enabled or disabled.
- Conditional rendering driven by component state, `computed` or props.
- Focus management, keyboard handling, non-trivial emits and `v-model`.
- Loading, empty and error states of one component.
- Responsive branches.
- Frontend-only state that never reaches the backend: scroll position, an unread marker, one control's
  variants.

## Checklist

Answer top to bottom; the first match wins.

1. Does it cross the UI and the backend with a real, persisted data round-trip? → e2e candidate.
2. Is it a journey a user performs — a CRUD lifecycle, a multi-page flow, an auth or role boundary?
   → e2e.
3. Would a single mounted component with no real backend catch the regression? → component test.
4. Is it frontend-only state that never touches the backend? → component test.

"Cheapest harness that catches the regression" still holds — and for a genuine journey that harness is
e2e. Don't break a journey into component tests to save seconds.

## Don't duplicate a check across layers

When a component test owns a rule exhaustively, the journey asserts that the journey works and does
not re-enumerate the rule. The form's component test covers every validation case (empty, duplicate,
error cleared on edit, case sensitivity); the e2e lifecycle may hit one validation error on the way in,
then creates, lists, edits and deletes. Two copies of a matrix mean two places to update when the rule
changes, and the slow one adds nothing.

A journey may share per-test setup across named `test.step` phases for speed. Never buy that speed by
dropping a boundary assertion a step exists to make. If a combined journey starts failing unclearly,
split it at a user-meaningful boundary.
