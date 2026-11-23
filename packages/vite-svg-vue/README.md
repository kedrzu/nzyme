# @nzyme/vite-svg-vue

Vite plugin importing SVG files as static Vue functional components.

```bash
bun add -D @nzyme/vite-svg-vue svgo
```

## `svgVuePlugin(options?)`

Compiles `*.svg?component` imports. Every other SVG import — plain, `?url`, `?raw`, or `?component`
with further query parameters — is left to Vite.

```ts
import { svgVuePlugin } from '@nzyme/vite-svg-vue';

export default defineConfig({
    plugins: [svgVuePlugin({ svgo: { multipass: true } })],
});
```

```ts
import ArrowLeft from './arrow-left.svg?component';
```

The component renders a single `<svg>` element: the file's root attributes, with everything inside
as static `innerHTML`. Attributes passed by the caller win over the file's, `class` and `style`
merge, and listeners attach. There is no component instance and no reactivity inside the icon.

`svgo` is the svgo config applied to every file (`preset-default` when omitted). Whatever it says,
`removeScripts` runs last, and a final pass strips every `<script>`, every `on*` attribute, `srcdoc`,
any attribute value carrying a `javascript:` or `vbscript:` URL, every comment and processing
instruction, and turns CDATA into escaped text, because the markup reaches the DOM through
`innerHTML`.

A file that cannot be read or parsed, or whose root is not a single `<svg>`, fails the build with
its path in the message.

## Types

Add the module declaration for `*.svg?component` to the app's `tsconfig.json`:

```json
{
    "compilerOptions": {
        "types": ["@nzyme/vite-svg-vue/client"]
    }
}
```

## `compileSvgComponent(source, options)`

The compiler behind the plugin: SVG markup in, ES module code out (importing only `vue`).

## License

MIT
