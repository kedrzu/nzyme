# @nzyme/pen

Tooling for [Pen](https://pen.dev) design files (`.pen`) kept in git: a document model and the `pen`
commands of the `nzyme` binary.

## Installation

```bash
bun add -d @nzyme/pen @nzyme/cli
```

Every `@nzyme/*` package in a repo, `@nzyme/cli` included, must be one version.

## Commands from a plugin

List a one-line module re-exporting the plugin under `nzyme.plugins` in the root `package.json`:

```ts
// scripts/pen.ts
export { default } from '@nzyme/pen/plugin.js';
```

```json
{
    "nzyme": {
        "plugins": ["./scripts/pen.ts"]
    }
}
```

## Commands

- `nzyme pen check [files…]` checks the given files, or every `.pen` file git tracks. It fails on
  conflict markers, invalid JSON, duplicate ids or ids containing `/`, an instance (`type: "ref"`) of
  a missing node or of one without `reusable: true`, and a `$name` property value with no entry in
  `variables`. Free text (`content`, `name`, `context`, `metadata`) is never read as a variable
  reference, so "$5 off" passes. An unknown format `version` is a warning. Each problem is printed
  with its file and node; the exit code is 1 on any error.

## The document model

`PenDocument.ts` is what every command builds on:

- `parsePen(text)` parses and checks the shape the tooling relies on: nodes with a string `id` and
  `type` throughout `children` and `descendants`.
- `serializePen(doc, likeText?)` writes two-space JSON as Pen does, so an unchanged document gives
  back its input byte for byte. The output ends like `likeText` (Pen writes no trailing newline).
- `indexPen(doc)` maps every canvas node id to its node, parent id, position among its siblings and
  top-level frame.
- `walkPen(doc)` visits the canvas nodes and the nodes of override subtrees inside an instance's
  `descendants`: a replacement (an entry with its own `type`) or the `children` a property override
  sets. Those are flagged with the instance and id path they come from.
