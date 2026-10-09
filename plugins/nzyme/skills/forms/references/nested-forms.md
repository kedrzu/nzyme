# Nested forms

Factory functions in `useFormFields` and `useFormFieldArray` build nested structures. Nested fields
register with their parent automatically and take part in its validation.

## Nested object

```ts
const form = useForm({
    name: '',
    address: { country: '', street: '', city: '', postCode: '' },
});

const fields = useFormFields(form, {
    name: [requiredValidator()],
    // A factory instead of a validator list creates nested fields for the object
    address: field =>
        useFormFields(field, {
            country: [requiredValidator()],
            street: [requiredValidator()],
            city: [requiredValidator()],
            // Validator options are MaybeRefOrGetter — a getter can read other fields
            postCode: [postCodeValidator({ country: () => form.value.address.country })],
        }),
});

// fields.address.street, fields.address.postCode, …
```

## Dynamic array

`useFormFieldArray` from `@nzyme/vue-forms/useFormFieldArray.js`:

```ts
// An array of scalars with validators
const tagsForm = useForm<string[]>(['']);
const tagFields = useFormFieldArray(tagsForm, [requiredValidator()]);
// tagFields[i] is the field for tagsForm.value[i]
```

## Array of objects

```ts
interface Contact {
    name: string;
    email: string;
}

const form = useForm<Contact[]>([{ name: '', email: '' }]);

const fields = useFormFieldArray(form, field =>
    useFormFields(field, {
        name: [requiredValidator()],
        email: [emailValidator()],
    }),
);

function addContact() {
    form.value.push({ name: '', email: '' }); // fields follow automatically
}

function removeContact(index: number) {
    form.value.splice(index, 1); // fields follow; the surplus last field's scope is disposed
}
```

```vue
<template>
  <Form @submit="onSubmit">
    <div v-for="(contactFields, index) in fields" :key="index">
      <TextInput :field="contactFields.name" :label="t(l.nameLabel)" />
      <TextInput :field="contactFields.email" :label="t(l.emailLabel)" />
      <Button @click="removeContact(index)">{{ t(l.remove) }}</Button>
    </div>
    <Button @click="addContact">{{ t(l.addContact) }}</Button>
    <Button type="submit">{{ t(l.submit) }}</Button>
  </Form>
</template>
```

Fields are tied to indexes, not items (`useFormFieldArray` maps the array with `mapScopedArray`, which
tracks only its length). After deleting a row, each later row's values move up one index while the
field at that index — with its validation state, such as errors already shown — stays put.

## Deep nesting

Factories nest to any depth:

```ts
const fields = useFormFields(form, {
    customer: customerField =>
        useFormFields(customerField, {
            name: [requiredValidator()],
            addresses: addressesField =>
                useFormFieldArray(addressesField, addressField =>
                    useFormFields(addressField, {
                        street: [requiredValidator()],
                        city: [requiredValidator()],
                    }),
                ),
        }),
});

// fields.customer.addresses[0].street
```

## Validation propagation

The root form's `valid`, `invalid` and `validate()` cover every nested field:

```ts
if (!(await form.validate())) {
    return;
}

await save(form.value); // every field, nested or not, is valid here
```

For a single custom field with derived values or its own key, use `useFormField` from
`@nzyme/vue-forms/useFormField.js`.
