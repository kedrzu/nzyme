# @nzyme/vue-forms

Form state, validation and headless input primitives for Vue 3. The package renders no styled markup:
each input primitive returns a render function for the bare native element plus the field state, and
the app wraps it once into its own styled component.

How to write forms with it — the canonical form, which submit trigger to use, validation practice,
nested forms and shared rules — is in the `nzyme:forms` skill (`plugins/nzyme/skills/forms/` in the
nzyme repo). This README is the catalogue.

```bash
bun add @nzyme/vue-forms
```

Peer requirements: `vue`, `vue-router` (`useButton` renders `RouterLink`), and an `IocPlugin` container
from `@nzyme/vue-ioc` with a `LanguageContext` (`useForm` and `useDateInput` read the language).

Every module is importable on its own: `.ts` files as `@nzyme/vue-forms/<path>.js`, `.tsx` files as
`@nzyme/vue-forms/<path>.jsx`. Everything below is also re-exported from the package root.

## Form state

### `useForm(value)` — `useForm.js`

Creates the root `FormModel<T>` over a plain value or a ref. The model is reactive:

|Member|Meaning|
|-|-|
|`value`|the form value; edit it directly|
|`fields`|fields registered under this node|
|`valid`|every field passes (whether or not errors are shown yet)|
|`invalid`|some field has a **shown** error|
|`validate()`|shows every error and resolves to `true` when valid|
|`reset()`|hides every error again|
|`ruleErrors`|every `useRules` message below this node, keyed by dotted path, shown or not|
|`lang`|the current language, passed to validators|

### `useFormFields(form, params)` — `useFormFields.js`

One field per key of `form.value`. Each param is `null`/`[]` (no validators), an array of validators, or
a factory `(subForm) => anything` for nested structures. Returns an object keyed like `params`.

```ts
const form = useForm({ email: '', address: { city: '' } });
const fields = useFormFields(form, {
    email: [requiredValidator(), emailValidator()],
    address: sub => useFormFields(sub, { city: [requiredValidator()] }),
});
// fields.email, fields.address.city
```

A `FormField<T>` extends `FormModel<T>` with `key`, `focused`, `errors` (shown messages),
`validators` (`FormValidatorState[]`: `error`, `messages`, `show`, `validate()`), `focus()` and `blur()`.
Fields can themselves be passed to `useFormFields`/`useFormField` as a sub-form.

### `useFormFieldArray(form, validatorsOrFactory)` — `useFormFieldArray.js`

For an array value: one field per item, created and disposed as items are added and removed (each in
its own effect scope). Pass validators for item fields, or a factory `(itemForm, index) => V` for
structured items.

```ts
const form = useForm({ phones: [''] });
const fields = useFormFields(form, {
    phones: sub => useFormFieldArray(sub, [requiredValidator(), phoneNumberValidator()]),
});
```

### `useFormField(form, params)` — `useFormField.js`

The low-level field constructor behind the two above. `{ validators, key? }` validates the parent's own
value; `{ value: ref, validators?, key? }` validates a custom ref. `key` is the path used to route
`useRules` messages.

### `useRules(form, rule, options?)` — `useRules.js`

Runs a rule from `@nzyme/validation` reactively over a form node's value and routes each message to
the field whose key path matches it (else the nearest ancestor). Options: `stopAt` (path prefixes where
the rule stops, `'*'` matches a segment) and `ctx` (a custom `ValidationContext`, re-validating on
change). Messages behave like validator errors and all appear in `ruleErrors`.

## Validators

Each validator is a function returning a `FormValidator`, imported from `validators/<name>.js`. Every
option except `lazy` and `custom` accepts a `MaybeRefOrGetter`. All take `message: (value, ctx) => string`
to replace the built-in text (built-in texts exist in `en`, `pl` and `de`).

|Validator|Options|Checks|
|-|-|-|
|`requiredValidator`|`condition`, `lazy`, `custom`, `message`|value is non-empty (or `custom` passes)|
|`emailValidator`|`message`|e-mail format|
|`phoneNumberValidator`|`message`|phone number format|
|`minLengthValidator` / `maxLengthValidator`|`minLength` / `maxLength`, `exclusive`|`length` of a string or array|
|`minValueValidator` / `maxValueValidator`|`minValue` / `maxValue`, `exclusive`|numeric bound|
|`minDateValidator` / `maxDateValidator`|`minDate` / `maxDate`, `exclusive`|date bound|
|`regexValidator`|`regex`|value matches|
|`postCodeValidator`|`country`|postal code of the country (async, lazy-loads its data)|

A `null` or `undefined` value passes every validator except `requiredValidator`.

**When errors show.** A validator's `behavior` decides when its error becomes visible. By default an
error shows when the field blurs after its value changed, and hides while the user edits it again.
`requiredValidator` shows as soon as the value changes while focused and on blur — with `lazy: true`,
not on blur. `validate()` shows every error regardless.

### `defineValidator(validator)` — `defineValidator.js`

Types a custom validator. Sync: `{ async?: false, validate(value, ctx), behavior? }`. Async:
`{ async: true, validate(value, ctx) => Promise, debounce?, watch?, behavior? }` — re-runs when the
value or `watch` changes, with `ctx.watch` holding the watched value. `validate` returns a message
(`TranslationResult`) when invalid and `undefined`/`null`/`false` when valid; `ctx.lang` is the
current language.

```ts
const skuValidator = defineValidator<string>({
    validate: (value, ctx) => (value && !isSku(value) ? translateToString(l.invalidSku, ctx.lang) : undefined),
});
```

Validator types (`FormValidator`, `FormValidatorSync`, `FormValidatorAsync`, `FormValidatorBehavior`,
`FormValidationContext`, …) come from `types.js`.

## `Form` component — `components/Form.jsx`

Wraps a native `<form novalidate>` and provides `FormContext` to everything inside.

- **Props:** `pendingClass` (class added while pending), `submitTrigger` (boolean — submits when it turns
  `true`), `submitEvent` (an event emitter — submits on each emit).
- **Emits:** `submit` — awaited if the listener returns a promise.
- **Slot props:** `pending`, `submit(callback?)`.
- **Submit:** Enter (a hidden native submit input), a `useButton` with `type="submit"`, the slot's
  `submit()`, or the props above. `submit(callback?)` ignores calls while pending, blurs the focused
  element, sets `pending`, runs `callback` then the `submit` listeners, and clears `pending` when they
  settle. While pending the `<form>` is `inert`.
- **After submit:** a field with errors scrolls into view (`createFormField` listens for completion).

It does not validate — the `submit` listener calls `form.validate()`.

### `FormContext` — `FormContext.js`

The context `Form` provides, injectable with `injectContext(FormContext)` from
`@nzyme/vue-utils/context.js`: reactive `{ pending, submit(callback?), events }`, where `events` has
`submitSucceed`, `submitFailed` (with the error) and `submitComplete` event emitters.

## Headless inputs

Every input primitive follows one shape:

- the composable carries `.props` and `.emits` to spread into the wrapping component's
  `defineProps`/`defineEmits`, and is called with no arguments inside its `setup`;
- it returns `field` (the field controller, below) and a render function named after the input, which
  renders the bare native element with value, ARIA and focus wiring; attributes passed to the render
  function (`class`, `id`, `aria-describedby`…) land on that element.

Common props (from `defineFormField`): `modelValue` (`v-model`), `field` (a `FormField` from
`useFormFields`), `errors` (extra messages), `required`, `disabled`, `readonly`. Common emits:
`update:modelValue`, `focus`, `blur`.

**Field controller** (`FormFieldController<T>`): reactive `value` (read/write; writes the bound
`field` or emits `update:modelValue`), `errors` (the `errors` prop plus the bound field's shown errors),
`focused`, `ok` (non-empty value and no errors), `inputAttrs` (`onFocus`/`onBlur` to put on a custom
element).

```vue
<script lang="ts">
import { useTextInput } from '@nzyme/vue-forms/components/useTextInput.jsx';

export const TextInputProps = useTextInput.props;
export const TextInputEmits = useTextInput.emits;
</script>

<script lang="ts" setup>
defineProps(TextInputProps);
defineEmits(TextInputEmits);

const { TextInput, field } = useTextInput();
</script>

<template>
  <label>
    <span>{{ label }}</span>
    <TextInput :class="$style.control" />
    <span v-if="field.errors.length" role="alert">{{ field.errors[0] }}</span>
  </label>
</template>
```

The wrapper is then used as `<TextInput :field="fields.email" :label="…" />` or with `v-model`.

|Primitive|Module|Value|Returns|Extra props|
|-|-|-|-|-|
|`useTextInput`|`components/useTextInput.jsx`|`string`|`field`, `input` (element ref), `TextInput`|`label`, `name`, `autocomplete`, `placeholder`, `tabindex`; emits `input`, `keydown`|
|`useTextArea`|`components/useTextArea.jsx`|`string`|`field`, `input`, `TextArea`|`label`, `name`, `placeholder`, `tabindex`|
|`usePasswordInput`|`components/usePasswordInput.jsx`|`string`|`field`, `PasswordInput`, `ShowPasswordButton`, `showPassword`, `togglePassword(show?)`|`label`, `placeholder`, `tabindex`|
|`useNumberInput`|`components/useNumberInput.jsx`|`number`|`field`, `NumberInput`|`label`, `autocomplete`, `placeholder`, `tabindex`|
|`useMoneyInput`|`components/useMoneyInput.jsx`|`number`|`field`, `MoneyInput`|`currency` (required), `label`, `placeholder`, `tabindex`|
|`useMaskedInput`|`components/useMaskedInput.jsx`|`string`|`field`, `MaskedInput`|`label`, `placeholder`, `tabindex`|
|`usePhoneInput`|`components/usePhoneInput.jsx`|`string`|`field`, `PhoneInput`|`country`, `name`, `label`, `placeholder`, `tabindex`|
|`usePostCodeInput`|`components/usePostCodeInput.jsx`|`string`|`field`, `PostCodeInput`|`country`, `label`, `placeholder`, `tabindex`|
|`useDateInput`|`components/useDateInput.jsx`|`Date`|`field`, `input`, `DateInput`, `CalendarButton`, `showCalendar()`|`min`, `max`, `label`, `name`, `autocomplete`, `placeholder`, `tabindex`|
|`useSelectInput`|`components/useSelectInput.jsx`|`string`|`field`, `SelectInput`|`label`, `autocomplete`, `placeholder`, `tabindex`|
|`useCheckbox`|`components/useCheckbox.jsx`|`boolean`|`field`, `Checkbox`|`indeterminate`, `name`, `tabindex`|
|`useRadioGroup`|`components/useRadioGroup.js`|primitive|`field`|see below|
|`useRadio`|`components/useRadio.jsx`|—|`field` (the group's), `state`, `Radio`|see below|

Per-primitive behaviour:

- **`useTextArea`** — a one-row `<textarea>` that grows to its content on input and value change.
  `TextArea` (`components/TextArea.js`) is the same as a ready component.
- **`usePasswordInput`** — `PasswordInput` switches between `type="password"` and `"text"` with
  `showPassword`; `ShowPasswordButton` (out of tab order) and `togglePassword()` flip it and refocus the
  input.
- **`useNumberInput`** — `<input type="number">`; `NumberInput` takes `min`, `max`, `step` attributes.
- **`useMoneyInput`** — an IMask input formatted for the `currency` (from `@nzyme/money`: symbol,
  thousands separator, decimal places). The value is an integer in the currency's smallest unit (`moneyNormalize`: 12.50 PLN is `1250`).
- **`useMaskedInput`** / **`defineMaskedInput<T>()`** — any IMask mask. Unlike the others, the setup
  takes options: `maskConfig` (`MaybeRefOrGetter<{ mask, blocks?, lazy?, inputmode?, placeholderChar? }>`),
  `toModelValue(typed)` and `toTypedValue(model)`. `useMaskedInput` is `defineMaskedInput<string>()`;
  `defineMaskedInput<T>()` builds one for another value type.
- **`usePhoneInput`** — `<input type="tel">` formatted as you type with `libphonenumber-js` (loaded
  lazily) for the `country`, always shown with the international prefix; the cursor keeps its place.
- **`usePostCodeInput`** — IMask with a per-country mask (`PL` `00-000`, `DE` `00000`, `US`
  `00000[-0000]`, otherwise letters, digits, spaces and dashes); empty input becomes `null`.
- **`useDateInput`** — native `<input type="date">` with `min`/`max`; focusing it opens the browser
  picker. `CalendarButton` (translated `aria-label`) and `showCalendar()` open it too.
- **`useSelectInput`** — native `<select>`; `SelectInput`'s default slot holds the `<option>`s.
- **`useCheckbox`** — a `<button role="checkbox">` toggled on click, `aria-checked="mixed"` while
  `indeterminate` and not checked; the default slot is its content.

### Radio group

`useRadioGroup(props)` and `useRadio(props)` take the component's props explicitly; their prop and emit
definitions come from `getRadioGroupProps<T>()` / `getRadioGroupEmits<T>()` (the common field props)
and `getRadioProps<T>()` / `getRadioEmits<T>()` (`value` required, `name`, `tabindex`, `required`,
`disabled`, `readonly`; emits `selected(value)`). The group provides `RadioGroupContext`; each `Radio`
inside registers with it.

`Radio` renders `<button role="radio">`. Following the WAI-ARIA radio-group pattern, only the selected
(else the first enabled) radio is in the tab order and the arrow keys move focus and selection,
wrapping around. A readonly group or radio keeps focus movement but never changes the value. The
group's field is focused while any of its radios is. `state` holds `selected`, `readonly`, `disabled`,
`required`.

```vue
<!-- RadioGroup.vue -->
<script lang="ts" setup>
const props = defineProps(getRadioGroupProps());
defineEmits(getRadioGroupEmits());
const { field } = useRadioGroup(props);
</script>
<template>
  <div role="radiogroup"><slot /></div>
</template>

<!-- Radio.vue -->
<script lang="ts" setup>
const props = defineProps(getRadioProps());
defineEmits(getRadioEmits());
const { Radio, state } = useRadio(props);
</script>
<template>
  <Radio :class="{ selected: state.selected }"><slot /></Radio>
</template>
```

### `useButton` — `components/useButton.js`

Headless button with a busy state and double-submit protection.

- **Props:** `type` (`'button'` default, or `'submit'`), `busy`, `disabled`, `link`
  (`string | RouteLocationRaw`), `noWait`.
- **Emits:** `click(event)`, `update:busy(busy)`.
- **Returns:** `busy` and `disabled` (computed), `click(event)` (runs the click handling, e.g. from a
  keyboard shortcut), `Button` (render function; fallthrough attributes and slots land on the element).

`Button` renders `<button :type>`; with `link`, an `<a>` instead: an absolute URL (`scheme://`) gets
`rel="noopener noreferrer"`, a `#hash` stays a native anchor, anything else goes through
`RouterLink`.

**Busy and pending.** On click the button is pending until every `@click` listener's returned promise
settles — an `async` handler keeps it busy for its whole run. With `type="submit"` inside a `Form` it then
calls the form's `submit()` and is also busy for as long as the form is pending. A router link stays busy
until navigation completes plus 500 ms. `busy` is `true` while pending, while the `busy` prop is set, or
(for `type="submit"`) while the form is pending. A click while `busy` or `disabled` is swallowed
(`preventDefault` and `stopPropagation`), so a double click never runs the action twice. `noWait` skips
the pending state. A busy button is not `disabled`; rendering the busy state (a spinner, `aria-busy`)
is the wrapper's job.

```vue
<script lang="ts" setup>
defineProps(useButton.props);
defineEmits(useButton.emits);
const { Button, busy } = useButton();
</script>
<template>
  <Button :class="[$style.button, busy && $style.button_busy]" :aria-busy="busy || undefined">
    <slot />
  </Button>
</template>
```

`<AppButton @click="save">` with an `async save()` is then busy, and ignores further clicks, until
`save` resolves.

### Building another input — `defineFormField`

`defineFormField<T>(propType?)` (`components/defineFormField.js`) returns `{ props, emits, create }`:
the common field props and emits, and `create({ props })` — the field controller described above.
`formFieldProps`, `formFieldEmits` and `createFormField` are the same pieces separately. The built-in
primitives are made of these; a custom one (a PIN input, a combobox) uses them the same way:

```ts
const CODE_FIELD = defineFormField(String);
export const CodeInputProps = { ...CODE_FIELD.props, length: { type: Number, default: 6 } };

// in setup
const props = useProps(CodeInputProps);
const field = CODE_FIELD.create({ props });
```

## Exported types

- Models: `FormBase`, `FormModel`, `FormField`, `FormFields`, `FormFieldsParams`, `FormFieldBasicParams`,
  `FormFieldCustomParams`, `UseRulesOptions`, `UseRulesContextOptions`.
- Validators: `FormValidationResult`, `FormValidationContextAsync`, `FormValidatorBehaviorContext`, and
  each validator's options — `RequiredValidatorOptions`, `EmailValidatorOptions`,
  `PhoneNumberValidatorOptions`, `MinLengthValidatorOptions`, `MaxLengthValidatorOptions`,
  `MinValueValidatorOptions`, `MaxValueValidatorOptions`, `MinDateValidatorOptions`,
  `MaxDateValidatorOptions`, `RegexValidatorOptions`, `PostCodeValidatorOptions`.
- Inputs: `FormFieldValue`, `FormFieldOptions`, `FormFieldProps`, `FormFieldPropsDefinition`,
  `FormFieldDefinition`, `ButtonProps`, `ButtonEmits`, `RadioProps`, `RadioGroupProps`,
  `MaskedInputMaskConfig`, `MaskedInputOptions`, `NumberInputAttrs`.

## License

MIT
