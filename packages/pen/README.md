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
- `nzyme pen merge <base> <ours> <theirs> [path]` is git's merge driver for `.pen` files. It merges
  node by node (`mergePen`): changes made on one side only land on their own; where both sides
  changed the same thing differently, ours is kept, a Markdown report goes to
  `<git dir>/pen-conflicts/<path, / as __>.md` and the exit code is 1, so git leaves the path
  unmerged with a valid file. A clean merge deletes the report. Register it with
  `git config merge.pen.driver "bun nzyme pen merge %O %A %B %P"` and `*.pen merge=pen -diff` in
  `.gitattributes`.
- `nzyme pen diff [<rev>] [<rev>] [-- <path>]` prints, as Markdown, what changed in a `.pen` file
  (`diffPen`). Revisions work as in `git diff`: none compares the working file with `HEAD`, one
  compares it with that revision, two compare the revisions. The path may be left out when git
  tracks exactly one `.pen` file. The output has a summary line, then per top-level frame one line
  per added or removed subtree (its topmost node, with how many nodes it holds), and per changed
  (with the changed properties, an instance's overrides as `descendants["a/b"].fill`) and moved
  node, then the changed variables with both values, then the
  changed components (a reusable node changed itself or in its subtree) with how many instances
  use each.
- `nzyme pen render <file | rev:path> <id…> [--out <dir>] [--scale <n>]` exports the nodes as
  `<id>.png` through `pen interactive`, headless, and prints the absolute paths of the PNGs written.
  A `rev:path` is read with `git show`; `pen` saves only to a temporary file, never to the input.
  The PNGs go to a new temporary directory unless `--out` names one; the scale defaults to 2. `pen`
  is the repo's own `node_modules/.bin/pen`: add `@pen.dev/cli` as a dev dependency, and run
  `bunx pen login` once per machine (no key is used). Without either, the command says which is missing
  and exits 1.

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
