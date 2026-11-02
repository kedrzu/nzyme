# Accessibility — WCAG 2.2 level AA

Read when building or reviewing a component, and when an a11y check fails. WCAG 2.2 AA (all level A
and AA success criteria) is the bar for every component; nothing ships below it, including internal
tools.

## How it is enforced

- **Axe runs on every story** through Storybook's a11y addon, inside the Vitest `storybook` project in
  browser mode. With `a11y.test: 'error'` in the preview parameters a violation fails the test run,
  locally and in CI; `'todo'` only reports it.
- **The rule set is the WCAG tags up to 2.2 AA:**

  ```ts
  a11y: {
      test: 'error',
      options: { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  },
  ```

  Without `wcag22aa` the target-size rule never runs: axe ships it disabled and only a tag listed in
  `runOnly` turns it on (axe-core 4.13). A preview with only the 2.0/2.1 tags enforces WCAG 2.1, not 2.2.
- **It checks what a story renders, after its `play` function**, across the whole `<body>` (portalled
  overlays included). A state with no story — the error state, the open menu, the busy button — is
  never checked. That is why the story-per-state requirement exists.
- **Axe proves the mechanical half.** Many criteria below have no axe rule at all and others are
  covered only partly; `color-contrast` reports text over images or gradients as "incomplete"
  (needs review), which does not fail the run. The rest is the author's, proven by a spec where it is
  behaviour (keyboard, focus) and by review where it is visual.
- **Turning the check down for a story** (`parameters: { a11y: { test: 'todo' } }` or `'off'`) is a
  disabled lint rule: never to get green, only with a comment naming why the rule is wrong for that
  story, and never for a component's real states.

## The criteria that matter for components

"Axe" says what the automated check covers; "author" is what remains. Level in brackets.

|Criterion|What it means for a component|Axe|Author|
|-|-|-|-|
|1.3.1 Info and Relationships (A)|structure in markup: lists are lists, labels are tied to fields, groups have a `fieldset`/`role="group"` with a name|list, definition-list, table and ARIA-structure rules|choosing the semantic element at all (a `div` "list" passes)|
|1.4.1 Use of Color (A)|state is never colour alone: errors have text, required has a marker, links in text are underlined|links in text blocks only|every other colour-coded state|
|1.4.3 Contrast (Minimum) (AA)|text 4.5:1; large text (24 px, or 18.66 px bold) 3:1|`color-contrast` on solid backgrounds|text over images and gradients; placeholder and disabled-looking-but-enabled text; hover and focus colours not shown in a story|
|1.4.4 Resize Text (AA), 1.4.10 Reflow (AA)|200 % text zoom and 320 CSS px width without loss or two-way scrolling|`meta-viewport` only|`rem` text, no fixed heights, a narrow-viewport story|
|1.4.11 Non-text Contrast (AA)|3:1 for input borders, checkbox and radio outlines, icons that carry meaning, focus indicators, the boundary of a control against its surface|nothing|tokens with documented contrast; the focus-ring mixin|
|1.4.12 Text Spacing (AA)|no clipping when users raise line, letter and word spacing|inline-style spacing only|no fixed-height text boxes|
|1.4.13 Content on Hover or Focus (AA)|tooltips and hover cards: dismissable with Escape, hoverable, persistent until dismissed|nothing|reka's Tooltip and HoverCard do it; a hand-built one must|
|2.1.1 Keyboard (A), 2.1.2 No Keyboard Trap (A)|everything works with the keyboard; focus can always leave (Escape closes dialogs)|focusable scroll regions and frames only — it never presses a key|build on `useButton`, the input primitives and reka; a spec drives the keyboard path of any custom widget|
|2.2.2 Pause, Stop, Hide (A)|auto-moving content over 5 s can be paused|`blink`/`marquee` only|a pause control on an auto-playing `Carousel`|
|2.4.3 Focus Order (A)|focus follows reading order; a dialog moves focus in and returns it to the trigger|nothing|no positive `tabindex`; reka's focus management; a spec asserts focus return|
|2.4.6 Headings and Labels (AA)|labels and headings describe their purpose|nothing|copy review|
|2.4.7 Focus Visible (AA)|every focusable element shows keyboard focus|nothing|the `focus-ring` mixin; never `outline: none` alone|
|2.4.11 Focus Not Obscured (Minimum) (AA)|a focused element is not entirely hidden by sticky headers, footers or banners|nothing|`scroll-padding` matching sticky bars; non-modal overlays not covering the focused control|
|2.5.3 Label in Name (A)|the accessible name contains the visible label text|nothing (its rule is experimental)|an `aria-label` repeats the visible words, never replaces them|
|2.5.7 Dragging Movements (AA)|anything done by dragging has a single-pointer alternative|nothing|buttons beside swipe (`Carousel`), beside drag-to-reorder, beside sliders|
|2.5.8 Target Size (Minimum) (AA)|pointer targets at least 24 × 24 CSS px, or spaced so a 24 px circle around each touches no other|`target-size`, only with `wcag22aa` in `runOnly`|the `touch-target` mixin for icon buttons and inline controls|
|3.3.1 Error Identification (A), 3.3.3 Error Suggestion (AA)|an error is shown in text, tied to its field, and says how to fix it|nothing|field wrapper wiring (`aria-invalid`, `aria-describedby`, `role="alert"`); validator messages|
|3.3.2 Labels or Instructions (A)|every field has a visible label; format hints are visible, not only placeholders|a field with no name at all (`label`, `form-field-multiple-labels`)|a visible label, never placeholder-only|
|3.3.7 Redundant Entry (A), 3.3.8 Accessible Authentication (Minimum) (AA)|no re-typing what the flow already has; login works with paste and password managers|nothing|never block paste; correct `autocomplete` on credential and address fields|
|4.1.2 Name, Role, Value (A)|every control exposes a name, its role and its state (`aria-expanded`, `aria-checked`, `aria-busy`)|most of the rule set — button, link, input and ARIA names, valid roles and attributes|states the component adds itself, such as `aria-busy` on a busy button|
|4.1.3 Status Messages (AA)|a change shown without moving focus is announced|nothing|`role="status"` / `role="alert"` or a live region for toasts, saved confirmations, result counts, field errors|

## Checklists by component

- **Button.** Built on `useButton`; busy is `aria-busy` with visually hidden loading text, never
  `disabled`; icon-only has a translated `aria-label`; 24 px target; `focus-ring`. Spec: async click
  → busy → second click ignored.
- **Input.** Built on the matching `use*Input` in the shared field wrapper: visible label, hint and
  errors in `aria-describedby`, `aria-invalid`, `autocomplete` where the field is personal data, 3:1
  border. Stories: empty, filled, error, disabled, readonly.
- **Checkbox and radio.** `useCheckbox` / `useRadioGroup` already give the ARIA role and state, and
  the radio group its arrow-key model; the group gets a name (`aria-labelledby` on the visible legend); the box and the
  checked mark meet 3:1.
- **Dialog and sheet.** reka `Dialog`: `Title` (visually hidden if needed), `Description`, focus
  trapped and returned, Escape closes, the page behind hidden from assistive technology (reka does it
  for a modal dialog). Story with `play` that
  opens it.
- **Menu, popover, combobox, tabs.** reka parts; triggers are your `Button` through `as-child`;
  `aria-expanded` and `aria-controls` come from reka — do not set them by hand.
- **Tooltip.** Supplements a name, never is the only one; reachable by keyboard focus; no tooltip on a
  disabled control.
- **Carousel.** List semantics and a label; previous/next buttons; `keyboard`; a pause control when
  auto-playing; slides off the current page are not focusable traps (`Carousel` turns to a focused
  item).
- **Toast and inline status.** A live region (`role="status"`, or `alert` for errors) that exists
  before the message is inserted; never the only place an error is shown; does not steal focus.
- **Animated content.** Motion respects `prefers-reduced-motion`; content leaving through `Reveal`
  is made `inert` so focus cannot land in it mid-animation.
