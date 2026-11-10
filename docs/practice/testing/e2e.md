# E2E tests — Playwright

Read when writing or reviewing a Playwright spec. Whether a flow belongs in e2e at all is in
`e2e-vs-component.md`. E2E runs the built apps, so rebuild what you changed before running it.

## Component harnesses

A harness is a typed class that wraps one component's DOM, so specs never hold selectors.

- **Positional constructor `(parent: Locator, testId: string)`**, never an options object. One shape lets
  any harness nest in any other.
- **`root` is `parent.locator(...)` on the project's test-id attribute, and every internal locator goes
  through `this.root`** — never `page.locator` inside a harness. A test id is not unique on the page: a
  list, a modal and the page behind it can all carry the same one, and a page-level lookup fails with
  "strict mode violation: resolved to N elements".
- **Nest through the parent's `root`:** a compound component's harness builds its children from its own
  `root`. At the top level of a spec, root at `page.locator('body')`.
- **HTML, ARIA and tag selectors only — never CSS classes.** CSS-module class names are hashed at build
  time, so the class in the source does not exist in the running DOM. Tags, `[type=…]`, roles and
  ARIA attributes (`role="alert"`, `aria-busy`) survive.
- **No raw text lookups** (`getByText` on the body, `:has-text`) to find a component: the same text
  often appears in two places, such as a list snippet and the detail view. Scope through the harness;
  reach for `.filter()` or `.nth()` only when no parent can disambiguate.

```ts
import type { Locator } from '@playwright/test';

export class TextInputHarness {
    readonly root: Locator;

    constructor(parent: Locator, testId: string) {
        this.root = parent.getByTestId(testId);
    }

    get input(): Locator {
        return this.root.locator('input');
    }

    get error(): Locator {
        return this.root.getByRole('alert');
    }

    async fill(value: string): Promise<void> {
        await this.input.fill(value);
    }
}

const form = new SignUpFormHarness(page.locator('body'), 'sign-up-form');
const email = new TextInputHarness(form.root, 'email');
await email.fill('ada@example.com');
```

## Parallel safety

Run specs with `fullyParallel: true`: tests in one file run concurrently and share nothing.

- **No `test.beforeAll` / `test.beforeEach` that creates data.** Create users, records and anything else
  a test needs inside the test body. Immutable fixtures (a `const` definition) may live at module scope;
  anything created may not.
- **No module-level `let` assigned from a hook or helper.** A helper returns what the test needs.
- **Data generators make every value unique per test** — a random suffix on emails, names, ids, phone
  numbers. A fixed value shared by two parallel tests collides on the same backend record. Prefer
  human-readable values ("Ada Lovelace" plus a suffix) over `test1`, so a row is easy to find when
  debugging.
- **Never assert on "all" of anything** — a list, a table, a count. Other tests write to the same
  backend at the same time; find the rows by what this test created.

## Helpers

- A helper is `async` and performs its whole step (fills a form, calls an API) or returns the data the
  test needs; the test never repeats what the helper did.
- Build URLs from the project's route helpers, never a hardcoded host or port.
- Seed state through the product's real commands. Don't build a seeding endpoint or helper for a state no
  real feature produces yet: that tests the scaffolding, and the scaffolding becomes dead weight.

## Journeys

A journey groups related steps in named `test.step` phases on shared per-test setup, and reloads to
prove what it did persisted. Don't add `test.slow()` without a measured need.

## Failures

Many e2e failures are environment, not code. A different handful of specs failing each run, each at the
same exact timeout, and each passing alone, points to contention on shared infrastructure; confirm one in
isolation before editing a spec. A worker killed with exit 137 at teardown received `SIGKILL`, which test
runners routinely send to app servers: judge the run by Playwright's final summary, not the exit code.
