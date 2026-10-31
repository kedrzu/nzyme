# Styling — tokens, CSS modules, variants, states

Read when writing a component's styles or adding a design token. Class naming (BEM with a single `_`,
camelCase) is in `nzyme:code-conventions`; how the token partials are injected into every SCSS block
is part of the UI package setup in the `architecture` skill.

## Design tokens

- **Token partials emit no CSS** — only `$variables`, `@mixin`s and `@function`s. They are injected
  into every SCSS block of the repo's own sources, so a single emitted rule would be duplicated into
  every component's CSS. Say so in a comment at the top of each partial.
- **Name tokens by role, not by look**: `$color-text-muted`, `$color-surface-card`,
  `$color-border-strong`, `$color-focus`, `$radius-pill`. A role name survives a rebrand; a component
  never picks `$color-gray-500` because it happened to look right.
- **Document the contrast on the token** a text or border colour is meant for — a comment such as
  `// 4.8:1 on $color-surface`. The pairing is checked once, where the colour is defined, and a component using
  the documented pair inherits the check.
- **A raw value in a component is a missing token.** Hex colours, spacing in px, font sizes, radii,
  shadows and z-indexes come from the partials; a one-off layout number (a grid track, an
  illustration's size) is fine local.
- **Global CSS lives in one `main.scss`** imported once by the app and by the Storybook preview: reset,
  `@font-face`, `body` defaults, the global `:focus-visible` ring, the `.visuallyHidden` helper if it
  is a global class.
- **Breakpoints used from TypeScript** (a `matchMedia` in a composable) get a TS mirror of the SCSS
  values and a test asserting the two match.

## CSS modules

- `<style lang="scss" module>` in every SFC; `$style.x` in the template. When the script needs a class
  name (a computed class list), `useCssModule()`; never import the SFC's style through a query string.
- A `.tsx` component or a style shared by several SFCs uses `Foo.module.scss`.
- Class names are hashed at build. Tests and harnesses never select by class (`nzyme:testing`).
- A `class` prop for an inner element is declared with `classProp` from
  `@nzyme/vue-utils/classProp.js` (`contentClass: classProp`).
- Keep selectors flat: one class per element, a modifier class or a state attribute on top. Deep
  descendant chains break when markup changes and fight the module scope.

## Variants with CSS custom properties

Variants and colours are orthogonal: a colour class sets the component's custom properties, a variant
class consumes them, and every combination works without a rule per pair.

```scss
.button {
    --button-accent: #{$color-action};
    --button-accent-hover: #{$color-action-hover};
    --button-on-accent: #{$color-text-on-action};

    border: 1px solid var(--button-accent);
    border-radius: $radius-control;
    padding: $spacing-08 $spacing-16;
}

.button_danger {
    --button-accent: #{$color-danger};
    --button-accent-hover: #{$color-danger-hover};
}

.button_primary {
    background: var(--button-accent);
    color: var(--button-on-accent);
}

.button_secondary {
    background: transparent;
    color: var(--button-accent);
}
```

A caller adjusting one instance sets a custom property (`--button-accent`) on it, never overrides
the component's internal classes. Each colour × variant pair still needs contrast checked — a
`Gallery` story renders them all, so axe checks every text pair at once.

## Style states from the DOM

The primitives already put state on the element. Style from it rather than mirroring state into
classes that can drift:

|State|Selector|Set by|
|-|-|-|
|busy|`[aria-busy='true']`|your button wrapper, from `useButton`'s `busy`|
|disabled|`:disabled`, `[aria-disabled='true']`|the primitive|
|invalid|`[aria-invalid='true']`|your field wrapper|
|checked, selected|`[aria-checked='true']`, `[aria-selected='true']`|`useCheckbox`, `useRadio`, reka|
|open, closed|`[data-state='open']`|reka parts|
|keyboard focus|`:focus-visible`|the browser|

The field wrapper's `focused`/`readonly` come from the field controller as modifier classes, because
they sit on the wrapper, not on the input.

## Interaction mixins

Keep these in the token partials so every component gets the same behaviour:

- **`focus-ring`** — a `:focus-visible` outline in `$color-focus` with an offset. 2.4.7 requires it to
  be visible and 1.4.11 gives it 3:1 against the adjacent colours; a 2 px solid outline (the AAA 2.4.13
  measure) meets both on every surface without per-component checking. Never `outline: none` without
  it.
- **`touch-target`** — guarantees a 24 × 24 CSS px hit area (2.5.8; aim for 44 on touch-first UI) with
  an inset `::before` when the visual element is smaller, so the icon does not grow.
- **`hover`** — wraps hover styles in `@media (hover: hover)`; on touch devices a hover style sticks
  after a tap.
- **`reduced-motion`** — `@media (prefers-reduced-motion: reduce)` shortens or removes movement;
  opacity fades may stay.

## Layout stability

- A state change never changes a control's size: a busy button keeps its content in the layout with
  `opacity: 0` and overlays the spinner absolutely. An error appearing under a field either has its
  space reserved or enters through `Reveal`, so the content below moves smoothly instead of jumping.
- Content must reflow at 320 CSS px width and survive 200% text zoom (1.4.10, 1.4.4): sizes in `rem`
  for text, no fixed heights on text containers, `min-width: 0` on flex children that hold text.
