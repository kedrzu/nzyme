---
name: translations
description: >-
    User-facing text with @nzyme/i18n, @nzyme/i18n-core, @nzyme/i18n-compiler and @nzyme/vue-i18n —
    authoring `.loc.yaml` files (parameters, pluralization, typography shortcuts, language tags),
    compiling them with `nzyme localise`, and consuming them through Translator, useTranslate,
    translateToString and the Translate component. Use whenever you add or change user-facing text in a
    project that has `.loc.yaml` files or imports @nzyme/i18n or @nzyme/vue-i18n — UI strings are never
    hardcoded — and when translating in services, Vue components or plain helpers.
---

# Translations

User-facing text lives in `[name].loc.yaml` files, compiled by the `nzyme localise` CLI command
(`@nzyme/cli`, built on `@nzyme/i18n-compiler`) into typed `[name].loc.ts` modules. Each key becomes an
exported translation function `(lang, params?) => string | parts`.

## Which API where

|Context|Call|Import|
|-|-|-|
|Service / command (IoC)|`translator(l.key, params?)`|`Translator` from `@nzyme/i18n/Translator.js`, injected via `deps`|
|Vue `<script setup>` / template|`t(l.key, params?)`|`useTranslate()` from `@nzyme/vue-i18n/useTranslate.js`|
|Plain helper (no container)|`translateToString(l.key, lang, params?)`|`@nzyme/i18n/translateToString.js` — the caller passes `lang`|
|Text containing components (links, emphasis)|`<Translate :t="l.key">` with one named slot per `{param}`|`Translate` from `@nzyme/vue-i18n/Translate.vue`|
|The current language|`useLanguage()` → `ComputedRef<Language>`|`@nzyme/vue-i18n/useLanguage.js`|

`Translator`, `useTranslate`, `useLanguage` and `Translate` read the language from the
`LanguageContext` interface (`@nzyme/i18n/LanguageContext.js`) — a `() => Language` the app registers in
its container (`container.set(LanguageContext, () => currentLanguage)`). Never pass a language to
`Translator`. A test that resolves anything translating must set `LanguageContext` too.

## File format

One `.loc.yaml` colocated with the component or service it serves, same base name:
`ProductCard.vue` + `ProductCard.loc.yaml` → generated `ProductCard.loc.ts`. A folder-level file is
acceptable only for strings shared across that folder. Write `.loc.yaml` (the compiler also accepts
`.loc.yml`; don't add more of those). Keys must be valid identifiers; a reserved word (`default`,
`delete`, …) still works — it is exported under an alias.

**Every key needs every language the project ships.** The generated code is a `switch` on the language
with no fallback: a missing language renders as an **empty string at runtime, silently**.

```yaml
addToCart:
  en: Add to cart
  pl: Dodaj do koszyka

greeting:
  en: Hello {name}!
  pl: Witaj {name}!
```

- `{name}` becomes a required named parameter of the generated function (typed `unknown`; a plural
  count is `number`).
- Quote values that start with `{` or contain `: ` — YAML otherwise parses them as maps and compilation
  fails: `'{count} items'`.
- A literal brace is escaped: `\{` / `\}`.

### Language tags

A language key may carry tags in brackets — `de[auto]: …` — which the compiler strips; the output is
identical. The established use is `[auto]` on machine-written translations, so a human reviewer can
grep for unreviewed ones: when you write a translation in a language other than the source language,
tag it `[auto]` and leave removing the tag to the reviewer. Follow the project's own tag policy if it
has one.

## Pluralization

`plural:` names the parameter carrying the count.

```yaml
itemsInCart:
  plural: count
  en:
    one: one item
    many: '{count} items'
  pl:
    one: jeden produkt
    few: '{count} produkty'
    many: '{count} produktów'
```

Plural rules exist only for the languages in `@nzyme/i18n-core/pluralizationRules.js`; a plural key in
any other language fails with `No pluralization support`. The compiler rejects unknown forms and
missing required ones — don't use CLDR names like `other` or `two`.

|Language|Required forms|Optional|Selection|
|-|-|-|-|
|`en`, `de`|`one`, `many`|`zero`|1 → `one`; 0 → `zero` if present, else `many`; rest → `many`|
|`pl`, `cs`|`one`, `few`, `many`|`zero`|1 → `one`; 0 → `zero`, else `many`; last digit 2–4 when the count is below 10 or above 20 → `few`; rest → `many`|

## Typography — automatic replacements

The compiler rewrites these sequences in every value:

|You write|Becomes|Use for|
|-|-|-|
|`_`|narrow no-break space (U+202F)|number–unit gap: `'{count}_kg'`|
|`__`|no-break space (U+00A0)|a normal-width space that must not wrap|
|`--`|non-breaking hyphen (U+2011)|a hyphen that must not wrap|

A literal underscore in visible text is therefore impossible — there is no escape for `_`. Orphans are
fixed automatically: one- and two-letter words are glued to the following word with a no-break space
(unless that word has 12+ characters), so don't hand-place `__` after short words.

## Consuming translations

Import the generated module as a namespace, with the `.js` extension:
`import * as l from './ProductCard.loc.js';`

```ts
// Service — Translator resolves the language from LanguageContext
export const OrderMailer = defineService({
    name: 'OrderMailer',
    deps: { translator: Translator },
    setup({ translator }) {
        return (customerName: string, itemCount: number) => ({
            subject: translator(l.orderConfirmed),
            greeting: translator(l.greeting, { name: customerName }),
            summary: translator(l.itemsInCart, { count: itemCount }),
        });
    },
});

// Plain helper — the caller passes the language
export function formatCartSummary(count: number, lang: Language) {
    return translateToString(l.itemsInCart, lang, { count });
}
```

```vue
<script setup lang="ts">
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';

import * as l from './ProductCard.loc.js';

const t = useTranslate();
</script>

<template>
  <button>{{ t(l.addToCart) }}</button>
</template>
```

`t()` returns a plain string, so it cannot embed a `RouterLink`. Use `Translate`; each `{param}` becomes
a named slot rendered in place:

```yaml
termsConsent:
  en: I accept the {termsLink}.
  pl: Akceptuję {termsLink}.
```

```vue
<Translate :t="l.termsConsent">
  <template #termsLink>
    <RouterLink :to="termsRoute">{{ t(l.termsLinkLabel) }}</RouterLink>
  </template>
</Translate>
```

## Workflow

1. Create or edit the `.loc.yaml` next to its component or service.
2. Run `nzyme localise` (usually a `localise` script in the root `package.json`; `--watch` recompiles on
   change). Compile errors print as `file:line:column [key/lang] - message`.
3. Import the generated `.loc.js` and consume it with the API from the table above.

## Anti-patterns

|Bad shape|Concrete failure|
|-|-|
|A user-facing string hardcoded in `.vue`/`.ts`|Untranslatable and invisible to translators|
|Editing a `.loc.ts` file|Generated — the next `localise` run overwrites it|
|A key missing one of the project's languages|That language renders an empty string — no error, no fallback|
|Expecting a literal `_` in output|Always replaced with U+202F; there is no escape|
|CLDR plural forms (`other`, `two`) or a missing `few` for `pl`/`cs`|Compile error: unknown or missing plural form|
|An unquoted value starting with `{`|Parsed as a YAML map — compile error|
|A `Record<Enum, Translation>` label map|Redundant — name the keys after the enum values and index the namespace (`l[status]`) behind a type guard|
