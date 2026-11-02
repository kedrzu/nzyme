# Components — wrappers, animation, stories, harnesses

Read when building a component past the button in `SKILL.md`. The props and options of every nzyme
primitive named here are in its package README; this file is how to use them in a UI layer.

## Field wrapper

Every input wrapper (`nzyme:forms` shows the pattern) renders inside one shared field wrapper that
owns what a field looks like and what it announces. The primitive owns value, `:field` binding,
errors and focus; the wrapper owns the label, hint, error list and their wiring:

- **An `id` from `useId()`**, given to the input and to the `<label for>`; the visible label is the
  accessible name (3.3.2, 4.1.2). A placeholder is never the label.
- **`aria-describedby`** pointing at the hint and the error list, so a screen reader reads them on
  focus; **`aria-invalid`** while errors show.
- **The error list as `role="alert"`**, rendered from `field.errors` — it announces when an error
  appears (3.3.1, 4.1.3) and is what harnesses query.
- **Required shown in text or an icon with a text alternative**, not by colour alone (1.4.1).

Hand these to the input through a scoped slot (`#default="{ inputAttrs }"` with `id`,
`aria-invalid`, `aria-describedby`) and bind them on the primitive's render function, which puts
attributes on the native element. The state classes (`focused`, `invalid`, `disabled`, `readonly`)
come from the field controller, never from a second copy of the state.

## reka-ui wrappers

reka-ui gives headless WAI-ARIA widgets with the focus and keyboard model done. Wrap each widget
**once** in a themed component and use only the wrapper:

- **Triggers take `as-child` and come from a slot** (`<slot name="trigger" />`), so the caller passes
  your `Button` and the trigger keeps its busy state, styling and test id.
- **Always render the `*Portal`.** Overlay content inside a scroll container or a transformed parent is
  clipped or mis-positioned otherwise.
- **A dialog always has `DialogTitle` and `DialogDescription`** — wrapped in reka's `VisuallyHidden`
  when the design shows none. They are the dialog's accessible name and description.
- **`v-model` through `defineModel`** (`v-model:open`), props with `defineProp` from
  `@nzyme/vue-utils/defineProp.js`; forward only the reka props callers need.
- **Positioning constants in one module** (`side`, `sideOffset`, `collisionPadding`, animation
  duration) shared by every floating wrapper, with one shared style module for the floating surface.
- **Style parts by `:class` and reka's data attributes** — `[data-state='open']`, `[data-side]`,
  `[data-highlighted]`, `[data-disabled]` — not by tracking state in the wrapper.
- **`ConfigProvider` once at the app root and in the Storybook preview**, with the current locale and
  `dir`; date and number widgets read them. Configure its body-scroll compensation (`scrollBody`) so
  opening a dialog does not shift the page sideways; `useScrollLock` from `@nzyme/vue` exposes the
  scrollbar width as `--body-padding-right` for fixed elements.
- **Tooltips carry no essential information** and never sit on a disabled control; content needed to
  act goes in the label or a description.

## Compound components

A component made of parts (`TabGroup` + `TabPane`, `Table` + `TableColumn`, `Menu` + `MenuItem`)
shares state through a context in `FooContext.ts`, built with `defineContext` /
`provideContext` / `injectContext` from `@nzyme/vue-utils/context.js`. Parts register with the parent
through the context; the parent never inspects its slot's vnodes. When reka has the pattern (tabs,
menus, listbox), the parts wrap reka parts and the context carries only what reka does not.

## Transitions and animated containers

|Need|Use|Notes|
|-|-|-|
|A spinner, badge or overlay fading in and out|`TransitionFade` (`:duration="100"` for small UI)|`mode` is `out-in` by default — swapping keyed children never overlaps|
|A panel, sheet or dialog entering from an edge|`TransitionSlide` (`direction`, `fade`)|pair with `TransitionFade` on the backdrop|
|A counter or badge whose value changed|`TransitionBump` on a keyed child|—|
|Items added to and removed from a list|`TransitionList`|leaving items go `position: absolute`; give the list a positioned parent|
|A new effect used in more than one place|`defineTransition` + a `.module.scss`|one per effect, not one per component|
|A `v-if` block that must push the content below smoothly|`Reveal` around the `v-if` (or a keyed child to swap)|height animates; use `beforeLeave` to make leaving content `inert`|
|A section opened and closed by a toggle|`Collapse :show`|`render: 'always'` when the hidden content must keep its state or be in the DOM|
|A row of cards paged horizontally|`Carousel`|see below|

- Keep UI motion short (100–250 ms) and honour `prefers-reduced-motion` in the transition's styles
  (`references/styling.md`).
- **`Carousel` accessibility is the author's.** Use `items-tag="ul"` with `li` items and an
  `itemsAttrs` `aria-label`; turn on `keyboard`; render previous/next buttons through the `wrapper` slot
  (swipe and drag alone fail 2.5.7, and the buttons are the keyboard path). `autoPlay` pauses only on
  hover: an auto-playing carousel also needs a visible pause control (2.2.2).
- **SSR caveat.** `Reveal`, `Collapse`, `Carousel` and the transitions import `*.module.scss` from
  `.tsx` sources, which Nuxt's per-component SSR style inlining does not pick up. On a server-rendered
  page their styles arrive only with the client bundle — carousel slides render stacked until
  hydration (layout shift). An SSR app built on them needs the style settings in
  `../architecture/references/nuxt-app.md` (SPA or SSR). An SPA is unaffected.

## Modals

- **Declarative** — a dialog shown from local state: your reka `Dialog` wrapper with `v-model:open`.
- **Imperative** — a confirm or prompt awaited from code (`if (await confirm(…))`): a dialog component
  declaring `useModalProps<R>()`, opened with `useModalOpen()`; `ModalHost` mounted once in the app
  root. The modal is still built from your dialog wrapper, so it looks and announces the same.
- Return focus to the trigger on close (reka's `Dialog` does; a hand-built modal must) and keep Escape
  closing it (2.1.2).
- Stories render an imperative modal directly with `createModalMock()` as its `modal` prop.

## Stories

`Foo.stories.tsx` beside `Foo.vue`, CSF3 with TSX renders, `title` mirroring the folder
(`'Forms/TextInput'`), `tags: ['autodocs']`. The preview supplies the IoC container, a mocked router,
`ConfigProvider` and the language toolbar, so a story renders the component exactly as an app does.

```tsx
import type { Meta, StoryObj } from '@storybook/vue3-vite';

import TextInput from './TextInput.vue';

const meta: Meta<typeof TextInput> = { title: 'Forms/TextInput', component: TextInput, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof TextInput>;

export const Default: Story = { render: () => <TextInput label="Email" modelValue="" /> };
export const WithError: Story = {
    render: () => <TextInput label="Email" modelValue="ada@" errors={['Enter a valid email']} />,
};
export const Disabled: Story = { render: () => <TextInput label="Email" modelValue="ada@example.com" disabled /> };
```

- **A story per state** the user can see: default, each variant (or one `Gallery` story of them),
  disabled, readonly, busy/loading, error, empty, long content (wrapping, overflow), open (for
  overlays). Axe checks only what a story renders.
- **States reached by interaction get a `play` function** (open the dropdown, click the async button).
  The a11y check runs after `play`, so the open menu and the busy button are checked in that state.
- **Overlays render into `<body>`**; the a11y check covers the whole body, so a portalled dialog is
  checked as long as a story opens it.
- **Services a component injects are replaced in the story's decorator** through the container
  (`nzyme:ioc`), never by a prop added for the story's sake.
- Story-only styles go in `Foo.stories.module.scss`, never into the component.

Specs over these stories — `composeStories`, `userEvent`, `expect.element` — follow
`nzyme:testing` (`references/component-tests.md`). The busy button is the canonical spec: an
async-click story, one click, `aria-busy="true"` while the promise is pending, a second click not
running the action again.

## Harnesses

A component that e2e specs drive ships `Foo.harness.ts` beside it, exported from the UI package so the
e2e package imports it; harness rules (positional constructor, `root` on the test id, ARIA selectors,
no CSS classes) are in `nzyme:testing` (`references/e2e.md`). For the test id to land, a component
keeps fallthrough attributes on its root element (the default) — `useButton` and the input primitives
already forward them to the native element.

## Text

Every string the component renders, visible or not — labels, the loading text of a busy button, an
icon-only button's name, a dialog's hidden title — comes from `Foo.loc.yaml` beside it
(`nzyme:translations`). A component placed inside a translated sentence uses `Format` from
`@nzyme/vue`, never string concatenation.
