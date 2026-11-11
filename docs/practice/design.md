# Design

The product is designed in [Pen](https://pen.dev), in a `.pen` file committed to the repo. The code is built from
that file, so the design changes the way code does: on a branch, in the PR that builds it, merged with the rest.

What is true only in one repo — the file's path and layout, screen codes, the visual direction, where design logs
live — sits above this document in the repo's `design` skill, and wins where it differs. The commands:
`nzyme/packages/pen/README.md`.

## Design on your own branch

- **Each branch changes its own copy of the `.pen` file** and builds from it in the same PR. There is no design
  branch to wait for.
- **The file merges node by node.** git runs `bun nzyme pen merge` as the merge driver for `*.pen`, so branches
  that changed different nodes, properties or variables merge on their own. Parallel design work is normal.
- **Only Pen changes the file:** the `pen` CLI, the Pen app or the Pen MCP. Never edit its JSON by hand.
- **Close the file in the Pen app, or don't save there, while a `pen` run or a merge rewrites it.** The app would
  save its open copy over the result.

## A design round through the `pen` CLI

The `pen` CLI runs the same agent as the Pen app: the same system prompt with Pen's design skill appended, the same
model and effort. Its work matches the app's. A session driving the Pen MCP itself lacks that skill unless it reads
it, and designs noticeably worse, so rounds go through the CLI.

1. **Write a brief** to `.context/` (gitignored). It holds:

   - **"Load the `design` skill first."** The CLI's agent reads `CLAUDE.md` but not `AGENTS.md`, so the brief is
     what brings it the repo's rules.
   - **The intent:** what the user is doing there and why the screen exists.
   - **What to draw:** each screen and state (empty, loading, error, disabled, long text, no permission).
   - **Constraints:** the data shown, product rules, what must not change.
   - **What to reuse:** existing components and screens, by name and id.
   - **Where it goes:** the frame, and the codes to use.
   - **"Take a screenshot of each finished part and check it"**, so the agent sees its own work.

   Each run is one-shot, with no memory of the previous one: the brief and the design log carry the continuity. A
   follow-up brief says what the last round did and what is to change.
2. **Run it** from the worktree, in the background (a round takes minutes):

   ```sh
   bunx pen --in <file> --out <file> -C "$(pwd)" --model claude-opus-5-5 --effort high \
       --prompt "Read the design brief at .context/<feature>-brief.md and follow it." \
       --export .context/<feature>.png
   ```

   It saves once, at the end: a failed run leaves the file untouched.
3. **Read the reply and look at the PNG.** `bun nzyme pen render <file> <id…>` renders single nodes. When the
   result misses, write a follow-up brief rather than patching it yourself through the MCP.
4. **Record the round** in the design log and run `bun nzyme pen check`.

**Credentials: only `pen login`, once per machine.** Its session serves every later `pen` command, and the agent
inside runs on the user's own Claude login. There are no keys and no API keys: nothing in the secret store, the repo
or the environment. When `pen` answers "Authentication required", the login is the owner's to do: say so and stop.

## The owner's rounds in the Pen app

The owner opens the worktree's `.pen` file in the Pen app and steers the app's agent. That agent loads the repo's
skills, so it follows the same `design` skill and records its rounds in the log. The owner's own edits on the canvas
reach the log only when they say so; then record them as an owner round. `bun nzyme pen diff` shows them either way.

## The design log

One Markdown file per feature, named after it in kebab-case, where the repo's skill says. Continue your feature's
log; leave other features' logs alone. It is committed in the same commit as the `.pen` change it records.

- **The header:** the intent in a few sentences, and the base revision: the commit the work started from.
- **One section per round:** who (an agent's brief, the owner's feedback in the app, implementation), what was
  asked, what changed and why.
- **Node-level entries as unticked boxes:** ``- [ ] <frame or component> (`id`): what changed, before → after``.
  Record every change, however small: a colour changed next to a new screen is exactly what gets missed.
- **A coding agent ticks an entry as it builds it,** so the next one knows what is left. It says in its reply what
  it left unticked and why.
- **Reversing a change:** correct or remove its entry while it is unticked. A ticked entry has been built, so it
  stays, and the reversal is a new entry.

```markdown
# Saved filters

A list can save its current filter under a name, shown in the sidebar. Base: `3e4d1d3d`.

## Round 1 · agent brief

Asked: the dialog that saves a filter, the sidebar section, its empty state.
Changed: two screens; the sidebar section is a new component.

- [x] App · Lists (`aB3xY`): new `L14 · Save filter` and `L15 · No saved filters`.
- [ ] Sidebar / Section (`Qp7rT`): new `Saved filters` section under Projects.

## Round 2 · owner in the app

Asked: "the dialog is too heavy, name it inline". Changed: the dialog became a field in the toolbar.

- [ ] Toolbar / Filter (`Zr2kM`): new inline name field, hidden by default.
- [ ] App · Lists (`aB3xY`): `L14` shows the inline field instead of the dialog.

## Round 3 · implementation

Forced by: the empty state's hint failed the contrast test (3.9:1).

- [ ] `L15` hint (`Wq4Lc`): `$fg-dim` → `$fg-muted`.
```

## What changed

`bun nzyme pen diff <base>`, with the log's base revision, lists everything since: added, removed, changed and moved
nodes per top-level frame, changed variables, changed components with how many instances use each. It includes the
owner's edits in the app that no log mentions. Read it before continuing someone else's design, before building from
a log, and before resolving a conflict.

## The design follows the implementation

When the code has to differ from the design — a state or screen the design didn't draw, a contrast or target size
that fails the accessibility tests, a layout the real data doesn't fit — the implementing agent brings the `.pen`
file in line on the same branch, in the same PR. A design that disagrees with the shipped code misleads whoever
builds from it next.

- **Small, within what the design already decided: do it.** A colour or token adjusted to pass contrast, a size or
  spacing enlarged to meet target size, a missing state (empty, loading, error, disabled, long text) drawn from
  existing components and patterns, copy that had to change, a detail that only aligns the drawing with the built
  screen.
- **Big: ask the owner first.** A new screen, flow or interaction; a layout or hierarchy change; a new component or
  pattern; a change to a shared component or token that visibly alters many screens; anything against a recorded
  design decision; any choice between options. Draw the proposal into a copy (`pen --out .context/<feature>.pen`),
  show before and after renders (`bun nzyme pen render`) with your recommendation, and change nothing until the
  owner answers.
- **Either way, a log round** marked as made during implementation, with what forced it (the failing test, the
  missing state).

## Merging and conflicts

`git merge` runs the driver. A real conflict — both sides changed the same property or override differently, one
deleted a node the other edited, both moved one node to different places, or both added one id with different
content — leaves the path unmerged with a valid file, ours kept at each conflict. The report, naming each conflict by
node id, name, screen and both values, is at `$(git rev-parse --git-path pen-conflicts)/<path, / as __>.md`.

1. **Read the report and both sides' design logs:** the intent behind each value, not only the value.

2. **Render the screens involved** on each side:

   ```sh
   bun nzyme pen render "$(git rev-parse HEAD):<path>" <ids…> --out .context/merge/ours
   bun nzyme pen render "$(git rev-parse MERGE_HEAD):<path>" <ids…> --out .context/merge/theirs
   bun nzyme pen render "$(git merge-base HEAD MERGE_HEAD):<path>" <ids…> --out .context/merge/base
   ```

3. **Apply the other side's intent on the merged file** through a `pen` run (the brief carries the report, both
   intents and the renders) or the Pen MCP.

4. **Render again** and compare, then `bun nzyme pen check`.

5. **Record the resolution** as a round in the log, `git add` the file and continue the merge.

Don't edit the JSON by hand, and don't take a whole side (`git checkout --ours`/`--theirs`): it drops the other
side's changes that merged cleanly.

## Components

The file is built from components, so a change made once reaches every screen. Keep it that way.

- **Nothing drawn twice by hand.** UI that repeats becomes a component first, then gets instanced. Look for an
  existing component before drawing.
- **A hierarchy, each level made of instances of the one below:** atoms (key, avatar, label, button, chip, tab) →
  parts (rows, headers, menu items) → panes and panels → screens.
- **Instances override content and state only:** text, icon, colour, visibility. An overridden property stops
  following the component, so never override layout or styling (padding, gap, size, font). Different styling is a
  different component.
- **Variants inherit.** A component can be an instance of another: make a variant that way, so the base's padding,
  type and colours stay in one place.
- **Names say what it is and which variant:** `Button / icon, label`, `List row / PR · checks`.
- **A change to a component changes every screen that uses it.** Look at a few of them afterwards.
- **Turning copies into instances:** swap a copy only for an instance that resolves to the same tree, overriding
  what differs. When the copy sat inside another component, move the overrides that pointed into it to its new id
  path. Compare the resolved trees before and after. Do the reads first and the writes after: reading between writes
  is slow on a large file.

## Naming screens, variants and questions

The owner reviews the file by scanning and searching the canvas, and documents cite screens by code. So a screen's
name says which screen it is, and whether a decision waits on it.

- **Every screen has a code, unique in the file:** letters for its area of the file and a number (`L14`). A new
  screen takes the next number; a code is never reused or changed, even after its screen is deleted, because
  documents cite it. Another state of a screen is a new number, not a letter suffix.
- **Code and title read the same everywhere** the screen is named: its frame, its caption, any slot around it.
- **Variants of one question sit together in one frame named `Variants · <the question>`**, each screen titled
  `<code> · Variant A · <what it is>`. A variant drawn over several screens gives each its own code and the same
  letter. Variant A is the one you recommend, and its caption says so. "Variant" appears in no other name, so
  searching for it lists exactly what is still to be picked.
- **Anything else for the owner to settle**, an open question or a guess the brief didn't cover, puts `Question ·`
  before the title (`L16 · Question · Who sees a private filter`) and the question in the caption.
- **Both are amber, so they show from far away:** the `Variants · …` frame, or the frame around a question's screen,
  gets the fill `#D299221A`, the stroke `#D29922` at 2 px and 24 px of padding. No other frame is amber, so amber
  always means "the owner decides here".
- **Once the owner picks:** delete the rejected variants (git history keeps them), move the chosen screens out and
  delete the `Variants` frame, and drop `Variant A ·` from their titles; the codes stay. A settled question loses
  `Question ·` and its amber. The log records the renames too.

## Checks

`bun nzyme pen check` runs in `lint` and `lint:check`, so in CI. It fails, naming the node, on conflict markers,
invalid JSON, a duplicate id or one containing `/`, an instance of a missing or non-reusable node, and an undefined
`$variable`. Run it after every round and every conflict resolution.
