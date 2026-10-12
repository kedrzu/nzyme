# Component tests — Vitest browser mode + Storybook stories

Read when testing one Vue component's behavior. Which behavior belongs here rather than in an e2e
journey is in `e2e-vs-component.md`.

A component test mounts ONE component in a real headless browser (Vitest browser mode with the
Playwright provider), with no backend and no routing. It is the frontend analogue of a unit test:
deterministic, fast, no flake surface. Mount it through its Storybook stories, so the test reuses the
decorators, mocked services and args the story already sets up.

Write one when the component owns logic: conditional rendering driven by its own state or a
`computed`, a watcher, click/keyboard handlers, focus management, an emit whose payload it builds,
loading/empty/error transitions, responsive branches. A component whose script holds only props,
emits and pass-through needs no test — its story is enough.

## Mechanics

- **Separate file pattern from `bun:test`.** The Vitest browser project globs its own pattern (commonly
  `*.spec.ts`, colocated with the `.vue` and its stories); `bun:test` files stay `*.test.ts`. A file
  neither runner globs is silently never run, and never mix `bun:test` and `vitest` imports in one file.
- **Import the stories module with `.jsx`** — the ESM counterpart of a `.tsx` source, the same way a
  `.ts` source is imported as `.js`.
- **`composeStories(stories)`** returns runnable stories with decorators and args applied; each
  `await Story.run()` mounts a fresh copy.
- **Drive real input** with `userEvent` from `vitest/browser` (`fill`, `click`, `keyboard`) and query with
  `page.getByRole` / `getByText` / `getByTestId` (the project's test-id attribute, as configured in
  `testIdAttribute`). Never reach into `wrapper.vm` or props.
- **Assert with `expect.element(locator)`** — it retries until the DOM settles. A plain `expect` on a
  locator does not retry and flakes.
- **`await page.viewport(width, height)`** at the start of a test exercises a responsive branch.

```ts
import { composeStories } from '@storybook/vue3';
import { expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import * as stories from './MessageInput.stories.jsx';

const { Default } = composeStories(stories);

test('keeps focus in the textarea after sending on desktop', async () => {
    await page.viewport(1024, 768);
    await Default.run();

    const textarea = page.getByRole('textbox');
    await userEvent.fill(textarea, 'hello');
    await userEvent.click(page.getByRole('button', { name: 'Send' }));

    await expect.element(textarea).toHaveFocus();
    await expect.element(textarea).toHaveValue('');
});
```

## Overriding args

`run()` takes a partial story context that is assigned at the top level, so `{ args }` **replaces** the
story's args instead of merging into them. Spread the story's own args to keep them:

```ts
await Default.run({ args: { ...Default.args, disabled: true } });
```

## What to assert

What the user sees: rendered text, attributes, computed style, focus, the emitted payload. Prove a
lazy load ran by its rendered result, not by a spy. Include a true negative (`not.toBeInTheDocument()`,
an element count of 0) so the assertion can fail.

A failing component test is usually the fastest reproduction of a UI bug — deterministic and with no
manual clicking. Keep it as the regression test once the bug is fixed.
