# @nzyme/vue

Vue 3 components and composables for app UIs: animated `Reveal`, `Collapse` and `Carousel`, lazy
hydration, an imperative modal service, scroll lock and sticky detection, plus small rendering helpers.
Composable practice (naming, return shape, reactivity pitfalls) is in the `nzyme:composables` skill;
this README is the catalogue.

```bash
bun add @nzyme/vue
```

Everything is exported from the package root. Each module is also importable on its own: `.ts` files as
`@nzyme/vue/<path>.js`, `.tsx` as `@nzyme/vue/<path>.jsx`, SFCs as `@nzyme/vue/<path>.vue`. `Reveal`,
`Collapse`, `Carousel` and `useScrollLock` import `*.module.scss`, so the bundler must process SCSS
modules from dependencies.

## Animated containers

### `Reveal` — `components/Reveal.jsx`

Animates the height of its box while its single child enters or leaves — wrap a `v-if` (or a keyed
child to swap content).

- **Props:** `duration` (ms; sets `--reveal-duration`).
- **Emits:** `beforeEnter`, `enter`, `afterEnter`, `beforeLeave`, `leave`, `afterLeave`, each with the
  `Reveal` instance.

```vue
<Reveal>
  <div v-if="form.value.hasCompany">
    <TextInput :field="fields.companyName" />
  </div>
</Reveal>
```

### `Collapse` — `components/Collapse.jsx`

Expands and collapses its content with a height animation.

- **Props:** `show` (boolean), `fade` (fade while resizing), `render` — `'lazy'` (default: the content
  mounts when shown and unmounts when hidden) or `'always'` (rendered up front, hidden with `v-show`).
- **Emits:** `heightChange(height)`, `afterEnter`, `afterLeave`.

```vue
<Collapse :show="expanded" fade>
  <ObservationDetails :observation="observation" />
</Collapse>
```

Under SSR, hidden `'lazy'` content is server-rendered with `v-show` and its hydration is deferred
(`LazyHydrate`) until `show` turns `true`.

### `Carousel` — `components/Carousel.jsx`

Paginated horizontal carousel: splits its items into pages of as many as fit the width, with swipe
(touch and mouse), auto-play and keyboard support. It re-measures on resize, on DOM changes inside and
when items change size.

|Prop|Default|Meaning|
|-|-|-|
|`page`|`0`|current page, `v-model:page`|
|`align`|`'center'`|where a page's items sit: `'start'` or `'center'`|
|`alignLeft`|`false`|the first page sits at the start whatever `align` says|
|`autoPlay`|—|ms between automatic page turns (wraps to the first page; pauses on hover)|
|`touch`|`true`|swipe with touch|
|`mouse`|`true`|drag with the mouse|
|`keyboard`|`false`|left and right arrow keys on an item turn the page|
|`class`, `itemsClass`|—|classes of the carousel and of the items element|
|`itemsTag`|`'div'`|items element tag; `'ul'` (with `li` items) gives list semantics|
|`itemsAttrs`|—|attributes of the items element (`role`, `aria-label`)|

Tab focus moving to an item on another page turns the carousel to it.

**Slots.** `default` renders the items; `wrapper` replaces the outer layout and must render the
`CarouselInner` it receives. Both get `CarouselSlot`: `pages`, `currentPage`, `hasNext`, `hasPrevious`,
`goToPage(index)`, `moveBy(n)`, `showItem(index)` (turn to the page holding an item and keep following
it while the layout settles). The instance exposes `goToPage`, `moveBy`, `showItem`.

```vue
<Carousel v-model:page="page" align="start" items-tag="ul" keyboard>
  <template #wrapper="{ CarouselInner, hasPrevious, hasNext, moveBy }">
    <button :disabled="!hasPrevious" @click="moveBy(-1)">‹</button>
    <CarouselInner />
    <button :disabled="!hasNext" @click="moveBy(1)">›</button>
  </template>
  <li v-for="item in items" :key="item.id"><ItemCard :item="item" /></li>
</Carousel>
```

`getCarouselPages({ items, width, align, alignFirstPageToStart? })` is the pure pagination it uses
(`GetCarouselPagesParams`, `CarouselItemBox`, `CarouselPage`, `CarouselAlign` types).

### `LazyHydrate` — `components/LazyHydrate.js`

Defers hydration of server-rendered content until a trigger; renders immediately when not hydrating.
Takes exactly one child.

- **Props:** `whenIdle` (`true` or `IdleRequestOptions`), `whenVisible` (`true` or
  `IntersectionObserverInit`; default `rootMargin: '100px'`), `whenTriggered` (boolean).
- **Emits:** `hydrated`.

```vue
<LazyHydrate when-visible>
  <HeavyFooter />
</LazyHydrate>
```

## Modals

An imperative modal service: open a component, get a promise of its result.

- **`ModalService`** (`modal/ModalService.js`, a `defineService`) — `open(component, props?, { parent? })`
  returns a `Modal<C>`: a promise of the result that also carries `id`, `controller`, `props` and the
  wrapped `component`. `component` may be a component, a promise of its module, or a loader
  `() => import('./X.vue')`. Opening blurs the focused element. The browser Back button and Escape both
  close the modal like `close()`. `modals` lists the open ones; `closeAll()` closes them.
- **`ModalHost`** (`modal/ModalHost.js`) — renders the open modals; mount it once in the app root. Its
  default slot receives `modals` to render them yourself.
- **`useModalOpen({ closeOnUnmounted? })`** (`modal/useModalOpen.js`) — `open` bound to the calling
  component (passes it as `parent`, so provide/inject reaches the modal). `closeOnUnmounted` (default
  `false`) closes this component's modals when it unmounts.
- **`useModalProps<R>()`** (`modal/useModalProps.js`) — the `modal` prop definition every modal
  component declares; `R` is its result type.
- **`ModalController<R>`** — what the modal receives as `modal`: `open`, `done(result)` (resolves the
  promise and closes), `close()` (rejects with `CancelError` and closes). The modal is removed on the
  next tick after closing, so a leave transition can run on `open` turning `false`.
- **`ModalContext`** (`modal/ModalContext.js`) — the controller provided to the modal's subtree.
- **`createModalMock<R>()`** (`modal/createModalMock.js`) — a reactive controller for stories and
  tests; `done`/`close` set `open` to `false`.
- Types (`modal/ModalTypes.js`): `Modal`, `ModalComponent`, `ModalProps` (props minus `modal`),
  `ModalResult`, `ModalController`, `ModalDone`, `ModalClose`, `ModalPropsBase`;
  `ModalServiceOpenOptions`, `UseModalOpenOptions`.

```vue
<!-- ConfirmDialog.vue -->
<script lang="ts" setup>
const props = defineProps({ ...useModalProps<boolean>(), question: { type: String, required: true } });
</script>
<template>
  <TransitionFade appear>
    <div v-if="props.modal.open" role="dialog" aria-modal="true">
      <p>{{ question }}</p>
      <button @click="props.modal.done(true)">OK</button>
      <button @click="props.modal.close()">Cancel</button>
    </div>
  </TransitionFade>
</template>
```

```ts
const openModal = useModalOpen();
const confirmed = await openModal(() => import('./ConfirmDialog.vue'), { question: 'Delete?' }).catch(() => false);
```

`CommonPlugin` (below) keeps the `CancelError` of a closed modal out of the error handlers.

## Composables

- **`useScrollLock({ condition? })`** (`useScrollLock.js`) — locks page scroll while mounted, or while
  `condition` (a ref or getter) is `true`. Counted across components: the page unlocks when the last
  lock releases. While locked, `<html>` has `overflow: hidden` and `--body-padding-right` holds the
  scrollbar width, for fixed elements to compensate. No-op on the server.
- **`useStickyElement({ position, element?, container? })`** (`useStickyElement.js`) — a ref that is
  `true` while a CSS `position: sticky` element is stuck. `position` is `'top'` or `'bottom'` (match the
  element's CSS); `element` defaults to the component's root; `container` defaults to the nearest
  scrollable ancestor, else the window; pass `'body'` only when `<body>` itself scrolls. Types:
  `StickyElementOptions`, `StickyElementPosition`, `StickyElementContainer`.
- **`useScrollableContainer(element)`** (`useScrollableContainer.js`) — computed nearest vertically
  scrollable ancestor of an element, `null` when only the window scrolls. `isElementScrollable(el)` is
  the check it uses.
- **`useEventBus(event?)`** (`useEventBus.js`) — a global, string-keyed event bus: `on(handler)` /
  `emit(arg)` for one event, or `on(event, handler)` / `emit(event, arg)` without one. Handlers added in
  a component are removed on unmount (and paused while kept-alive and inactive). No-op on the server.

## Rendering helpers

- **`Format`** (`Format.js`) — interpolates named slots into a string: `format="Hello {name}!"` renders
  the `name` slot in place. Typical use is putting components into a translated sentence.
- **`Proxy`** (`Proxy.vue`) — renders its default slot with `value`, typed by the generic: a way to
  name an expression in a template (`<Proxy :value="compute()" v-slot="x">`).
- **`ProxyAsync`** (`ProxyAsync.vue`) — like `Proxy` for a `Promise`; the slot gets the resolved value,
  `undefined` until then.
- **`ProxyContext`** (`ProxyContext.vue`) — calls its `ctx` function once at setup and passes the result
  to the slot as `{ ctx }`; runs a composable inside a template.
- **`SlotWrapper`** (`SlotWrapper.vue`) — renders `slot(props)` inside `tag` (default `div`), and
  nothing — no wrapper — when the slot renders empty.

```vue
<Format :format="t(l.termsSentence)">
  <template #terms><a href="/terms">{{ t(l.terms) }}</a></template>
</Format>
```

## App integration

- **`CommonPlugin`** (`CommonPlugin.js`) — `app.use(CommonPlugin)`: treats a `CancelError` (from
  `@nzyme/utils`) as a silent cancellation in `app.config.errorHandler` and in unhandled promise
  rejections, keeping the previous handlers for everything else.
- **`App`** (`App.js`) — an `@nzyme/ioc` interface (`defineInterface`) for the Vue `App` instance: a
  service declares it in `deps`, and the app binds its instance in the container.

## License

MIT
