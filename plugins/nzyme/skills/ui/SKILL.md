---
name: ui
description: >-
    Building Vue UI components the nzyme way — on the headless primitives of @nzyme/vue-forms (buttons
    with busy state and double-click protection, inputs, radios, forms) and on reka-ui, animated with
    @nzyme/vue-transitions and @nzyme/vue's Reveal, Collapse and Carousel, styled with SCSS design
    tokens, CSS modules and BEM; a Storybook story and a story-based test for every component, and
    WCAG 2.2 level AA enforced by axe in those tests. Use when creating, changing or reviewing a
    component in a UI package or an app's components. Not for: form state, validation and input
    mechanics (forms skill), test mechanics and harness rules (testing skill), UI text (translations
    skill), or setting up the UI package, Storybook and Vitest (architecture skill).
disable-model-invocation: true
---

# UI

A component is built on a primitive that already owns its behaviour — a headless composable from
`@nzyme/vue-forms`, a reka-ui part, an `@nzyme/vue` container — and adds only look, layout and text.
Re-implementing behaviour that a primitive owns (busy state, focus management, keyboard patterns,
ARIA wiring) is how components drift into bugs that each repo pays for separately.

What the packages export, with props and usage, is in their READMEs; this skill is the practice and
does not repeat them:

- `node_modules/@nzyme/vue-forms/README.md` — `useButton`, the `use*Input` family, `Form`;
- `node_modules/@nzyme/vue/README.md` — `Reveal`, `Collapse`, `Carousel`, `LazyHydrate`, the modal
  service, `useScrollLock`, `useStickyElement`, `Format`;
- `node_modules/@nzyme/vue-transitions/README.md` — `TransitionFade`/`Slide`/`Bump`/`List`,
  `defineTransition`.

## When NOT to use

- **Form state, validators, submit and pending, the input-component pattern** → `nzyme:forms`. This
  skill only adds how the field looks and what it announces.
- **How a component test or e2e spec is written** — `composeStories`, `userEvent`, `expect.element`,
  harness construction, selectors → `nzyme:testing`. This skill says which stories and tests must
  exist.
- **User-facing text** → `nzyme:translations` (`.loc.yaml` beside the component).
- **A `use[Feature]` composable or a store shared across components** → `nzyme:composables` /
  `nzyme:ioc`.
- **Setting up the UI package, Storybook, Vitest browser mode and token injection** → the
  `architecture` skill. This skill assumes they exist.

## Requirements

Every component, no exceptions:

|Requirement|Enforced by|
|-|-|
|A one-line `<!-- … -->` header comment as the file's first line|`nzyme index` puts it into the package's `INDEX.md`, which is how agents find the component|
|A `Foo.stories.tsx` with a story per state the component can be in|review — a state without a story is untested and unchecked for accessibility|
|Every story runs as a test: it must render and pass axe|the Vitest `storybook` project (browser mode); a render error or an axe violation fails the run|
|WCAG 2.2 level AA|axe at `a11y.test: 'error'` with the `wcag22aa` tags, plus what axe cannot see — `references/accessibility.md`|
|A `Foo.spec.ts` over the stories when the component owns behaviour|`nzyme:testing` decides what is worth asserting|
|`Foo.loc.yaml` when it shows text; no hardcoded strings|`nzyme:translations`|
|`Foo.harness.ts` when an e2e spec drives it|`nzyme:testing` (`references/e2e.md`)|

The story test is the floor for every component — it proves the component mounts with its real
decorators and that every state shown in a story meets the axe rules. A spec adds what the floor
cannot see: a click that makes a button busy, a keyboard path, an emitted payload. A component with
only props and pass-through has no spec; its stories are its tests.

## Layout

File-per-component, siblings beside it, flat until a folder earns its name (`forms/`, `dialog/`,
`layout/`):

```
src/
├── Button.vue
├── Button.stories.tsx
├── Button.spec.ts          # Vitest browser mode, over the stories
├── Button.harness.ts       # Playwright wrapper, when e2e uses it
├── Button.loc.yaml         # source text; Button.loc.ts is generated
├── forms/
│   ├── TextInput.vue …
│   └── FieldWrapper.vue    # label, hint, errors and their ARIA wiring for every input
├── TabGroup.vue
├── TabGroupContext.ts      # provide/inject of a compound component
└── TabPane.vue
```

The UI layer imports nothing from an app or a domain: a component takes data through props and
reports through emits. A domain component (an order summary) lives with its feature and is built
from the UI layer.

## Pick the base — first match wins

|You are building|Build it on|Why|
|-|-|-|
|Anything clickable that runs an action or navigates|your `Button`, wrapping `useButton`|busy while an async handler runs, swallows clicks meanwhile, `type="button"` by default, renders a link for `link`|
|A text, number, money, date, phone, select, checkbox or radio field|your wrapper of the matching `use*Input`, inside a shared field wrapper — `nzyme:forms`|value, `:field` binding, errors and focus come from the primitive|
|A widget with a WAI-ARIA pattern — dialog, popover, dropdown menu, tooltip, tabs, switch, combobox, listbox, date picker, toast, pin input|a reka-ui wrapper — `references/components.md`|focus trap, roving tabindex, keyboard model and ARIA states are already correct|
|A block that appears or disappears with a `v-if` and should push content smoothly|`Reveal`|animates the container height around the child|
|A section toggled open and closed|`Collapse` (`:show`)|height animation, lazy render, deferred hydration under SSR|
|A horizontally paged row of items|`Carousel`|pagination by width, swipe, keyboard, focus follows to the page|
|An element that fades, slides or pulses in and out|`@nzyme/vue-transitions`; `defineTransition` for a new one|one duration/delay API, `out-in` by default|
|A confirm or prompt awaited from code|`ModalService` / `useModalOpen` + a dialog component|a promise of the result, Back closes it|
|Anything else|a plain SFC|—|

Never wrap the wrapper's primitive a second time somewhere else: there is one `Button`, one
`TextInput`, one `Dialog`. A specialised component (a `SaveButton`, an `EmailInput`) wraps your
component and spreads its exported props.

## Component anatomy

```vue
<!-- Button that runs an async action, shows a spinner while busy and ignores clicks meanwhile. -->

<script lang="ts">
import { useButton } from '@nzyme/vue-forms/components/useButton.js';
import { TransitionFade } from '@nzyme/vue-transitions/TransitionFade.jsx';
import { defineProp } from '@nzyme/vue-utils/defineProp.js';

export type ButtonVariant = 'primary' | 'secondary' | 'text';

export const ButtonProps = {
    ...useButton.props,
    variant: defineProp<ButtonVariant>(),
};
export const ButtonEmits = useButton.emits;
</script>

<script lang="ts" setup>
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';

import * as l from './Button.loc.js';
import Spinner from './Spinner.vue';

const props = defineProps(ButtonProps);
defineEmits(ButtonEmits);

const { Button, busy } = useButton();
const t = useTranslate();
</script>

<template>
  <Button
    :class="[$style.button, $style[`button_${props.variant ?? 'primary'}`], busy && $style.button_busy]"
    :aria-busy="busy || undefined"
  >
    <span :class="$style.button_content"><slot /></span>
    <TransitionFade :duration="100">
      <span v-if="busy" :class="$style.button_spinner">
        <Spinner aria-hidden="true" />
        <span :class="$style.visuallyHidden">{{ t(l.loading) }}</span>
      </span>
    </TransitionFade>
  </Button>
</template>
```

- **Two script blocks.** The plain `<script>` exports `FooProps`, `FooEmits` and the prop unions so a
  specialised component spreads them; `<script setup>` follows the order in `nzyme:code-conventions`.
- **A busy button is never `disabled`** (why: the `vue-forms` README, "Busy and pending"). `useButton`
  does **not** set `aria-busy` — the wrapper binds it, and gives the busy state an accessible name (visually hidden loading text). The
  content stays in the layout with `opacity: 0`, so the button does not change width.
- **No pending refs around a button.** `<Button @click="save">` with an `async save()` is busy for the
  whole call; inside a `Form`, `type="submit"` is busy while the form is pending (`nzyme:forms`).

The rest — field wrappers, reka-ui wrappers, compound components, transitions and the `@nzyme/vue`
containers, modals, stories, harnesses — is in `references/components.md`.

## Styling, in short

- SCSS in `<style lang="scss" module>`; `$style` in the template, `useCssModule()` when the script
  needs a class name. No Tailwind, no global class names in components.
- Classes are BEM with a single `_` and camelCase (`nzyme:code-conventions`): `.button`,
  `.button_content`, `.button_primary`.
- Values come from design tokens — SCSS variables and mixins in partials that emit no CSS, injected
  into every component. A raw hex, px spacing or font size in a component is a missing token.
- Variants set CSS custom properties; one rule consumes them. Colour and variant stay orthogonal.
- Style states from the DOM the primitive already sets — `[aria-busy]`, `[aria-invalid]`,
  `[data-state='open']`, `:disabled`, `:focus-visible` — not from parallel state classes.

Details, the token rules and the state selectors: `references/styling.md`.

## Accessibility, in short

WCAG 2.2 level AA is the bar for every component. Axe in the story tests catches the mechanical part
— missing names, invalid ARIA, text contrast, and target size once the `wcag22aa` tag is in the run.
It cannot see focus indicators, non-text contrast, keyboard paths, focus hidden under a sticky header,
or announcements of changes; the author owns those, and a spec proves the keyboard and focus ones.
`references/accessibility.md` maps each success criterion to the check that covers it.

Per-story `a11y: { test: 'todo' }` or `'off'` is the same as disabling a lint rule: never to make a
failure go away; only with a comment naming why the rule is wrong for that story.

## Anti-patterns

|Anti-pattern|Concrete failure|
|-|-|
|A raw `<button>` with its own `saving` ref and `:disabled="saving"`|focus is lost mid-action, a fast double click runs the action twice, every button re-implements it|
|`disabled` while busy, or no `aria-busy`|keyboard users lose their place; screen readers hear nothing while the action runs|
|A raw reka-ui part used in a page|every page styles and labels it differently; Title/Description and portal rules are forgotten|
|A dialog without a `Title` (visually hidden if the design has none)|no accessible name; reka warns, axe fails the open-state story|
|A component with no story for its error, busy, disabled or open state|that state is never rendered in a test, so axe never checks it|
|A raw hex or px value in a component's style|the token set drifts; contrast documented on the token no longer applies|
|`outline: none` on focus without a replacement|focus becomes invisible (2.4.7) — axe passes it|
|Swipe- or drag-only interaction (a carousel without buttons)|fails 2.5.7 and keyboard users (2.1.1)|
|Classes as e2e selectors|CSS-module names are hashed at build — use the test-id attribute and ARIA (`nzyme:testing`)|

## References

- `references/components.md` — field wrappers, reka-ui wrapping conventions, compound components,
  transitions and `Reveal`/`Collapse`/`Carousel` (with the SSR style caveat), modals, stories,
  harnesses, text.
- `references/styling.md` — token partials, CSS modules, BEM, CSS custom properties for variants,
  state selectors, focus and touch-target mixins, motion, breakpoints.
- `references/accessibility.md` — the WCAG 2.2 AA criteria that matter for components, what axe
  checks and what it cannot, and per-component checklists.
