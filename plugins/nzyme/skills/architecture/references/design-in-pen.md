# Design in Pen

The product is designed in [Pen](https://pen.dev), in a `.pen` file committed to the repo. Every branch designs on
its own copy, the file merges node by node through a git merge driver, and a check keeps it valid. Practice:
`../../../../docs/practice/design.md`; commands: `nzyme/packages/pen/README.md`.

## In play, and when to ask

- **In play** when `ARCHITECTURE.md` records that the repo designs in Pen, or the request asks for it (design, Pen,
  mockups, screens to draw).
- **Asked** for a new repo, and for a general update of an existing one, when `ARCHITECTURE.md` records no choice.
  It is a question, not an inference: a new repo has no `.pen` file yet. A tracked `*.pen` file only makes "yes" the
  suggested answer.
- **Where the design file will live** (`design.pen` at the root, `docs/design/<product>.pen`) is asked with it. The
  file itself is created by the first design round.
- **The answer is recorded in `ARCHITECTURE.md` either way.** A "no" is settled like any recorded choice and is not
  asked again unless the request reopens it.

## Reference state

All of it works before the first `.pen` file exists.

- **`.gitattributes`:** `*.pen merge=pen -diff linguist-generated`. The merge driver merges the file; a text diff
  of a large JSON file is noise (`bun nzyme pen diff` replaces it).

- **The driver registered in `setup.sh`**, before its first `git merge` (`references/setup-scripts.md`): the
  `# {{if pen}}` block of `assets/setup.sh.tmpl`. Local git config is shared by every worktree of the clone, and
  setting it again is harmless. Without it git falls back to a whole-file conflict keeping ours.

- **The commands:** `@nzyme/pen` as a `workspace:*` dev dependency, and a plugin file listed under
  `nzyme.plugins` in the root `package.json`:

  ```ts
  // scripts/pen.ts
  export { default } from '@nzyme/pen/plugin.js';
  ```

- **The check in lint:** `&& bun nzyme pen check` appended to the `lint` and `lint:check` scripts. It checks every
  `*.pen` file git tracks; none means pass.

- **`@pen.dev/cli`** as an exact-pinned dev dependency: design rounds and `pen render` run the repo's own `pen`, and
  a pin keeps every machine on the agent the practice was written against.

- **Credentials: `bunx pen login`, once per machine**, listed in the onboarding steps (`README.md` or wherever the repo
  lists them). No pen.dev key and no API key: nothing in the secret store (`references/secrets.md`), the repo or the
  environment. CI runs only the check, which needs no login.

- **One line in `CLAUDE.md`/`AGENTS.md`:** "An implementation that has to differ from the design brings the `.pen`
  file along on the same branch: small changes on its own, big ones asked first (the `design` skill)." An
  implementing agent that never loads the `design` skill still needs the rule.

- **The repo's skill** `.claude/skills/design/SKILL.md` (`references/repo-skills.md`), required: Pen's own agent
  and the `pen` CLI's load it, and briefs name it. Its repo facts:

  - the design file's path and how it is laid out (top-level frames, where components live);
  - screen naming: the code letters of each area, and any convention of its own (colours, frame names);
  - the visual direction and brand: where they are decided, what not to change;
  - where design logs live (`docs/design/<feature>.md`, for example);
  - any rule of the practice the repo overrides.

  Then one sentence, "If the practice document isn't inlined below, read `nzyme/docs/practice/design.md` before
  changing the design." (Pen's agent may not run the `!` expansion), the link-base sentence, and
  `` !`cat nzyme/docs/practice/design.md` ``.

## Placeholders

- The design file's path: from the user, once.
- The `@pen.dev/cli` version: the latest on npm when the element is applied (`npm view @pen.dev/cli version`),
  pinned exactly.

## Compare

- `*.pen` marked `binary`, or with no `merge=pen`: a difference. A `binary` file conflicts as a whole on any two
  branches that touched it.
- `setup.sh` without the registration, or with it after the catch-up merge: a difference.
- No `nzyme.plugins` entry for the pen plugin, or no `pen check` in `lint` and `lint:check`: a difference.
- `@pen.dev/cli` missing, or as a range: a difference.
- A pen.dev or Anthropic key in the secret store, `.env` or CI for design work: a difference. Remove it; `bunx pen login`
  is the only credential.
- No `design` skill, one that does not inline the practice document, or one that sends design work to a single
  design branch or to a prompt pasted by the owner: a difference.
- No "design follows the implementation" line in `CLAUDE.md`/`AGENTS.md`: a difference.
