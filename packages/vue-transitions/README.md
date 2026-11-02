# @nzyme/vue-transitions

Ready-made Vue 3 transition components, most with a per-use `duration` and `delay`, and the factory
they are built with.

```bash
bun add @nzyme/vue-transitions
```

Everything is exported from the package root; each module is also importable on its own
(`@nzyme/vue-transitions/TransitionFade.jsx`, `…/defineTransition.jsx`, `…/TransitionList.vue`). The
components import `*.module.scss`, so the bundler must process SCSS modules from dependencies.

## Common props

`TransitionFade`, `TransitionSlide`, `TransitionBump` and anything made with `defineTransition` wrap
Vue's `<Transition>` and share these props. `duration` and `delay` set the CSS `transition-*`
properties, so they have no effect on `TransitionBump`, which runs a CSS animation:

|Prop|Meaning|
|-|-|
|`duration`|transition duration in ms (set inline with `!important` for the transition's run)|
|`delay`|transition delay in ms|
|`appear`|run on first render|
|`mode`|`'out-in'` (default), `'in-out'` or `'default'`|
|`group`|render a `<TransitionGroup>` instead: `true`, or `{ tag?, class? }` (tag defaults to `div`)|
|`onBeforeEnter`, `onAfterEnter`, `onBeforeLeave`, `onAfterLeave`|hooks `(el) => void`, or an array of them|

The default slot holds the `v-if`/`v-show`/keyed child (or the list, with `group`).

## Components

- **`TransitionFade`** — opacity in and out, 100 ms by default.
- **`TransitionSlide`** — `direction` is `'down'` (default: enters from above), `'up'` (from below),
  `'left'` (from the left) or `'right'` (from the right); it leaves back the way it came, by its full
  size; with `fade`, by 30% while fading. `--transition-slide-distance` overrides the distance.
  100 ms by default.
- **`TransitionBump`** — a fixed 100 ms scale animation: enters shrinking from 1.3 to 1, leaves
  growing from 1 to 1.3; for a badge or counter that changes.
- **`TransitionList`** (`TransitionList.vue`) — a `<TransitionGroup>` for lists: items animate in and out
  and the rest move into place. Props: `tag` (`'div'`), `duration` (ms, `400`), `delay` (ms, `0`),
  `animation` (`'fade'` default, `'slide-up'`, `'slide-down'`, `'slide-left'`, `'slide-right'`),
  `zIndex`. Leaving items are taken out of the flow (`position: absolute`).
- **`TransitionGroupSlide`** (`TransitionGroupSlide.vue`, not re-exported from the package root) — a
  `<TransitionGroup>` whose items fade and slide in from 30 px to the right, 400 ms; others move into
  place. Prop: `tag` (`'div'`).

```vue
<TransitionFade :duration="100">
  <Spinner v-if="busy" />
</TransitionFade>

<TransitionSlide direction="up" fade appear>
  <div v-if="modal.open" role="dialog">…</div>
</TransitionSlide>

<TransitionList tag="ul" animation="slide-up">
  <li v-for="message in messages" :key="message.id">{{ message.text }}</li>
</TransitionList>
```

## `defineTransition(def)`

Builds a transition component from CSS classes. `def` takes `name`, optional extra `props`, and the
`<Transition>` class names (`enterFromClass`, `enterActiveClass`, `enterToClass`, `leaveFromClass`,
`leaveActiveClass`, `leaveToClass`, and the `appear*` ones) — each a string or a function of the props.
The result has the common props above plus `props`.

```ts
import css from './TransitionZoom.module.scss';

export const TransitionZoom = defineTransition({
    name: 'TransitionZoom',
    props: { scale: { type: Number, default: 0.9 } },
    enterFromClass: props => (props.scale < 1 ? css.zoomIn : css.zoomOut),
    leaveToClass: props => (props.scale < 1 ? css.zoomIn : css.zoomOut),
    enterActiveClass: css.active,
    leaveActiveClass: css.active,
});
```

Exported types: `TransitionProps`, `TransitionGroupProps` (Vue's props minus the class names, plus
`duration`) and `TransitionGroupOptions`.

## License

MIT
