# nzyme submodule

nzyme is a git submodule at `nzyme/`, built from source inside the product. Two nzyme docs own this
element; read them, from this skill at `../../../../docs/`, in a product at `nzyme/docs/`:

- `submodule-setup.md` — the wiring: `.gitmodules` (`#add-the-submodule`), workspace and toolchain
  (`#workspace-and-dependencies`), generated tsconfigs (`#typescript-and-generated-files`), the build
  order (`#build`), the Nx inputs (`#nx`), lint and format exclusion (`#lint-and-format`), nzyme's
  tests (`#tests`), the agent rules for changes inside `nzyme/` (`#agents`).
- `consumers.md` — which commit the product pins and how the pin moves: the rules, the guard rails
  in the product, the bump of `main`, hotfixes on a production line.

Where this skill and those docs disagree, the docs win; report the disagreement.

## Reference state

What the docs leave to the product, and the repo-side state this skill checks:

- **`.gitmodules`** holds `nzyme` with `path` and `url` only (`https://github.com/kedrzu/nzyme.git`).
- **Checkout** is `git submodule update --init --recursive --checkout`, in `setup.sh`
  (`assets/setup.sh.tmpl`) and nowhere else locally; CI checks out with `submodules: recursive`
  (`references/github.md`). Why `--checkout`: `docs/submodule-setup.md#setup-script-and-worktrees`.
- **Bumps** are commits that move the gitlink, made by the bump workflow (`references/github.md`) or
  by hand with `bunx @nzyme/cli submodule bump --source origin/main`, which stages the move and prints
  the summary for the commit. A `--remote` update anywhere in the repo is a difference: it builds
  whatever nzyme `main` is today.
- **Tests:** the product's `tests` script runs `./packages` and `./scripts`, never `nzyme/`
  (`assets/package.json.tmpl`).

No asset of its own: step 0 in `SKILL.md` adds the submodule, the other files belong to the monorepo,
Nx, setup-scripts, lint-format and GitHub elements.

## Compare

- `.gitmodules`: a `branch` or `update` entry, or another URL, is a difference. When `update = merge`
  was there, existing clones keep it in `.git/config` after the file is fixed; `--checkout` in
  `setup.sh` overrides it, and this loop before the checkout removes it for good:

  ```sh
  for submodule_key in $(git config --file .gitmodules --name-only --get-regexp '^submodule\..*\.path$'); do
      submodule_name=${submodule_key#submodule.}
      submodule_name=${submodule_name%.path}
      git config --unset "submodule.$submodule_name.update" '^merge$' || true
  done
  ```

- Scripts: `git submodule update --remote` (often `upgrade:submodules`) and `bun update "@nzyme/*"` are
  differences — the second does nothing with `workspace:*` dependencies.

- `git submodule status` showing `-`, `+` or `U` after setup means the checkout is not on the pin:
  report it, never commit the moved gitlink as a side effect.

- Everything the docs list (workspaces, versions, patch, generated files, Nx inputs, lint exclusion):
  compare in the element that owns the file, against the doc section named above.
