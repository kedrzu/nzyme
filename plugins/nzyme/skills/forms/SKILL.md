---
name: forms
description: >-
    Vue forms with @nzyme/vue-forms and @nzyme/validation — useForm, useFormFields, useFormFieldArray,
    the Form component's submit and pending mechanics, built-in and custom validators, conditional and
    async validation, input components built on the headless useTextInput/useButton family, nested and
    dynamic forms, and shared validation rules run with useRules/validateRules. Use when writing or
    reviewing code that imports @nzyme/vue-forms or @nzyme/validation: creating a form, adding
    validation, building an input component, or sharing a business rule between a form and the
    backend. Not for general reactive logic or data loading (composables skill).
---

# Forms

`@nzyme/vue-forms` holds form state and validation; `@nzyme/validation` holds framework-free validators
and rules that the form validators wrap. Both are headless — the app owns the input components.

`useForm` reads the current language through `useLanguage()`, so forms need the app's IoC container
(`IocPlugin` from `@nzyme/vue-ioc`) with a `LanguageContext` registered (translations skill).

## Canonical form

`Form` tracks pending around your `@submit` handler and locks the form — but it does **not** validate.
The handler calls `form.validate()` first; `useForm` and `Form` meet only through the inputs' `:field`
bindings.

```vue
<script lang="ts" setup>
import { Form } from '@nzyme/vue-forms/components/Form.jsx';
import { useForm } from '@nzyme/vue-forms/useForm.js';
import { useFormFields } from '@nzyme/vue-forms/useFormFields.js';
import { emailValidator } from '@nzyme/vue-forms/validators/emailValidator.js';
import { requiredValidator } from '@nzyme/vue-forms/validators/requiredValidator.js';

import Button from '../ui/Button.vue';
import TextInput from '../ui/TextInput.vue';

// t and l come from useTranslate() and ./SubscribeForm.loc.js — translations skill

const form = useForm({
    email: '',
    name: '',
});

const fields = useFormFields(form, {
    email: [requiredValidator(), emailValidator()],
    name: [requiredValidator()],
});

async function onSubmit() {
    if (!(await form.validate())) {
        return;
    }

    await subscribe(form.value);
}
</script>

<template>
  <Form @submit="onSubmit">
    <TextInput :field="fields.email" :label="t(l.emailLabel)" />
    <TextInput :field="fields.name" :label="t(l.nameLabel)" />
    <Button type="submit">{{ t(l.submit) }}</Button>
  </Form>
</template>
```

During submit `Form` sets `inert` on the `<form>` — the browser disables every control inside, no
per-input wiring. `submit()` ignores re-entry while pending (no double submit) and blurs the active
element first, because errors are hidden on a focused input. Never add your own pending ref or
`:disabled="pending"`.

## How to trigger submit — first match wins

|Situation|Do this|Why|
|-|-|-|
|An ordinary submit button|a button built on `useButton` with `type="submit"` inside `<Form>`|on click it calls the form's `submit()` and shows `busy` while pending — both only for `type="submit"`|
|Submit on Enter|nothing|`Form` renders a hidden native `<input type="submit">` for exactly this|
|Auto-submit on a component event (an OTP input's `complete`)|`v-slot="{ submit }"` + `@complete="submit()"`|a component event can't trigger native submission and there is no click|
|Clicking an option IS the submit|`v-slot="{ submit }"` + `@click="submit(() => choose(option))"`|`submit(callback)` runs the callback inside the pending window|
|A parent drives submission|`submitTrigger` (boolean) or `submitEvent` (event emitter) prop on `Form`|`Form` watches both and calls `submit()`|

Default to `type="submit"`; the rest are exceptions.

## Input components

`@nzyme/vue-forms/components/` ships headless composables — `useTextInput`, `usePasswordInput`,
`useNumberInput`, `useMoneyInput`, `useMaskedInput`, `usePhoneInput`, `usePostCodeInput`,
`useDateInput`, `useSelectInput`, `useCheckbox`, `useRadioGroup`/`useRadio`, `useTextArea`, and
`useButton`. Each carries `.props`/`.emits` to spread into the component and returns a render function
plus a field controller (`value`, `errors`, `focused`, `ok`). The app wraps each **once** into a styled
component and uses only those:

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
  <label :class="$style.textInput">
    <span>{{ label }}</span>
    <TextInput :class="$style.textInput_control" />
    <span v-if="field.errors.length" :class="$style.textInput_error">{{ field.errors[0] }}</span>
  </label>
</template>
```

Every input accepts `:field` (bound to `useFormFields` — value, validation and error display) or
`v-model` (plain state, no validation). Never render a raw `<input>`/`<select>` in a form: it can't take
`:field`, so its errors never display. A business-specific input wraps an existing one.

## Validators

Import from `@nzyme/vue-forms/validators/<name>.js`. Parametrized validators take an **options object**
(never positional args) whose values are `MaybeRefOrGetter` — pass a getter to react to other fields.
Every validator accepts `message: (value, ctx) => string` to override its text.

|Validator|Call|
|-|-|
|`requiredValidator`|`requiredValidator()` — options `condition`, `lazy`, `custom`, `message`|
|`emailValidator`, `phoneNumberValidator`|`emailValidator()`|
|`minLengthValidator` / `maxLengthValidator`|`minLengthValidator({ minLength: 3 })`|
|`minValueValidator` / `maxValueValidator`|`minValueValidator({ minValue: 0 })`|
|`minDateValidator` / `maxDateValidator`|`minDateValidator({ minDate: new Date() })`|
|`regexValidator`|`regexValidator({ regex: /^\d+$/ })`|
|`postCodeValidator`|`postCodeValidator({ country: () => form.value.address.country })` — async, loads its data lazily|

The bound validators also take `exclusive`. Built-in messages exist in `en`, `pl` and `de`. **In any
other language the built-in message is an empty string, which the validator treats as "valid"** — a
project shipping another language must pass `message` to every built-in validator.

### Conditional

`condition` is a **synchronous** `MaybeRefOrGetter<boolean>`; a getter reading other fields re-evaluates
when they change:

```ts
const fields = useFormFields(form, {
    deliveryAddress: [requiredValidator({ condition: () => form.value.shipping === 'DELIVERY' })],
});
```

Async conditions are not supported — do a server-dependent check in the submit handler after
`validate()` and show it as a form-level error. `requiredValidator({ lazy: true })` shows the error
only after a submit attempt instead of on blur.

### Custom

`defineValidator` from `@nzyme/vue-forms/defineValidator.js`. Return a message when invalid, `undefined`
when valid — translated through `ctx.lang`:

```ts
const skuValidator = defineValidator<string>({
    async: false,
    validate: (value, ctx) => (value && !isSku(value) ? translateToString(l.invalidSku, ctx.lang) : undefined),
});
```

An async validator — `defineValidator({ async: true, debounce, watch, validate })` — re-runs when the
value or `watch` changes. A rule that must also run outside this form belongs in a shared rule instead
— see `references/rules.md`.

## Other patterns

- **Derive fields from other fields** — `form.value` is a plain reactive object: `watch` the source and
  assign (`form.value.billing = { ...form.value.shipping }`).
- **Form-level errors** (a failed API call) — a ref set in the submit handler and rendered with
  `role="alert"`; field errors display themselves through `:field`.
- **Multi-step forms** — one `useForm` per step, switched with `v-if`, each validating and submitting
  on its own. `Reveal` (`@nzyme/vue/components/Reveal.jsx`) animates the switch.
- **Nested objects and dynamic lists** — factory functions in `useFormFields` / `useFormFieldArray`;
  read `references/nested-forms.md`.

## Anti-patterns

|Anti-pattern|Concrete failure|
|-|-|
|Own pending ref, or `v-slot="{ pending }"` + `:disabled="pending"`|Duplicates `Form`'s `inert` lock — two pending sources drift apart|
|`v-slot="{ submit }"` + `@click="submit"` as an ordinary submit button|No `busy` state (it needs `type="submit"`), and Enter and click take different paths|
|A raw `<input>`/`<select>` in a form|No `:field` → validation errors never render|
|Reading `form.value` without `await form.validate()`|Invalid data reaches the API; untouched-field errors never show|
|Positional validator args: `minLengthValidator(3)`|Type error — options object only|
|Built-in validators in a language without built-in messages and no `message`|The empty message counts as valid — the field never fails|

## References

- `references/nested-forms.md` — nested objects, arrays of items, add/remove rows, deep nesting,
  validation propagation.
- `references/rules.md` — a rule shared with the backend or other forms: `defineRule`,
  `validateRules`, `useRules`, `stopAt`, message routing.
