# SVG components as one root vnode with static inner HTML

## Status

Accepted

## Context

Product apps import icons as `*.svg?component` and need a Vue component they can size, color and
label. The common plugin, `vite-svg-loader`, pinned `svgo` to the 3.x line and re-exported svgo 3's
`Config` type, which blocked svgo 4 in every consumer. It also compiles each SVG with Vue's template
compiler. That turns small icons into one vnode per element that Vue creates, patches and diffs,
though an icon's content never changes after build.

> **Checked 2026-11-23:** `vite-svg-loader` 5.1.3 is the latest release and depends on `svgo: ^3.3.5`.
> svgo 4.1.0 is the latest svgo.

> **Checked 2026-11-23:** Vue 3.5 skips hydrating the children of an element whose props carry
> `innerHTML`, and its prop-mismatch check does not compare `innerHTML`. `@nzyme/vite-svg-vue`'s
> browser spec hydrates server-rendered markup without a warning.

> **Checked 2026-11-23:** svgo 4's `removeScripts` matches event attributes case-sensitively against
> a fixed list. It keeps `onClick`, `onpointerdown`, `<SCRIPT>` and `<set to="javascript:…">`, and a
> browser runs all of these when they arrive through `innerHTML`.

> **Checked 2026-11-23:** svgo 4 prints comments, processing instructions and CDATA verbatim. The HTML
> parser behind `innerHTML` ends `<!-->` and `<?…>` at the first `>`, and `<![CDATA[` too under an HTML
> element (inside `<foreignObject>`), so an `<img onerror>` hidden in any of them becomes live.

## Options Considered

- **Vue template compilation (`vite-svg-loader`'s approach).** One vnode per element; Vue's static
  hoisting turns only larger trees into a static vnode. Trade-off: per-element runtime work for
  content that cannot change, plus a coupling to svgo's major version.
- **One `<svg>` vnode with the content as static `innerHTML`.** A functional component merges the
  caller's attributes over the file's root attributes and sets everything inside once. Trade-off: the
  markup bypasses Vue's escaping, so the plugin must sanitize it.

## Decision

`@nzyme/vite-svg-vue` emits one `<svg>` vnode with the content as static `innerHTML`. It runs two svgo
passes. The first uses the consumer's config plus `removeScripts`. The second splits the root from the
content. It also removes every script element, `on*` attribute, `javascript:`/`vbscript:` URL, comment
and processing instruction, and turns CDATA into escaped text, whatever config the consumer passes,
because `innerHTML` makes sanitizing the plugin's job.
svgo, vue and vite are peer dependencies, so the consumer chooses the svgo version.

## Consequences

- An icon costs one vnode, and hydration skips its content.
- Consumers move to new svgo majors when they choose to.
- The sanitizer is the plugin's own code and must keep up with what browsers execute. Its malicious
  fixture test is the guard.
- Ids inside an SVG are not unique across files unless the consumer adds svgo `prefixIds`.
