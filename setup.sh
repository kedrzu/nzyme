#!/bin/zsh
# Workspace setup for a clone or a worktree (Paseo runs it for every new worktree — see paseo.json).
# The build itself lives in setup.build.sh, which CI runs too.
set -e

REPO_ROOT=$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\.git\(/.*\)*$||')
CURRENT_DIR=$(pwd -P)
IS_WORKTREE=false
WARNINGS=()

# Warn now and again at the very end, so a skipped step is not lost above the build output.
warn() {
    echo "⚠️  $1"
    WARNINGS+=("$1")
}

# Inside a submodule (nzyme in a product repo) the git common dir belongs to the superproject, so
# REPO_ROOT would be the product repo: that is not a worktree, and its .env files are not ours.
SUPERPROJECT=$(git rev-parse --show-superproject-working-tree)

if [ "$CI" != "true" ] && [ -z "$SUPERPROJECT" ] && [ "$REPO_ROOT" != "$CURRENT_DIR" ]; then
    IS_WORKTREE=true
    echo ""
    echo "📂 Repo root: $REPO_ROOT"
    echo ""
fi

# --- Worktree: catch up with origin/main before anything is compiled ---

# A worktree is cut from the *local* `main` ref, which may have fallen behind origin. Catching up
# here means the build matches the commit the task branch will sit on. Worktrees only: in a plain
# clone the branch you are on is a deliberate choice, and setup has no business merging into it.
if [ "$IS_WORKTREE" = true ]; then
    echo ""
    echo "🔄 Catching up with origin/main..."
    echo ""

    if ! git fetch --quiet origin main; then
        warn "Could not fetch origin/main (offline?) — the build reflects this branch, not origin/main."
    else
        # Fast-forward the local `main` too, so the NEXT worktree is not cut from a stale base. Git
        # refuses to move a branch another worktree holds, so ask that worktree — and only when clean.
        MAIN_WORKTREE=$(git worktree list --porcelain \
            | awk '/^worktree /{wt=$2} /^branch refs\/heads\/main$/{print wt; exit}')

        if [ -z "$MAIN_WORKTREE" ]; then
            git fetch --quiet origin main:main \
                || warn "Local main not fast-forwarded (diverged from origin/main)."
        elif [ -n "$(git -C "$MAIN_WORKTREE" status --porcelain)" ]; then
            warn "Local main left as it is — $MAIN_WORKTREE has uncommitted changes."
        else
            git -C "$MAIN_WORKTREE" merge --ff-only --quiet origin/main \
                || warn "Local main not fast-forwarded (diverged from origin/main)."
        fi

        # A re-run on a branch carrying real work may not merge cleanly; a conflict under `set -e` would
        # leave a half-merged tree, so an unclean merge is rolled back and reported instead.
        if git merge --quiet --no-edit origin/main; then
            echo "✅ Up to date with origin/main"
        else
            git merge --abort 2> /dev/null || true
            warn "Could not merge origin/main into $(git branch --show-current) — merge it by hand. Until then the build reflects this branch, not origin/main."
        fi
    fi
fi

# --- Worktree: copy environment files ---

if [ "$IS_WORKTREE" = true ]; then
    echo ""
    echo "📋 Copying environment files..."
    echo ""
    # Every `.env` / `.env.*` in the main checkout except templates. `(N)` is zsh's nullglob, so a
    # pattern matching nothing is not a fatal "no matches found".
    for env_file in "$REPO_ROOT"/.env "$REPO_ROOT"/.env.*(N); do
        base_name=$(basename "$env_file")
        case "$base_name" in
            .env.example | .env.*.example) continue ;;
        esac
        if [ -f "$env_file" ]; then
            cp "$env_file" "$base_name"
        fi
    done
    echo "✅ Environment files copied from main repo"
fi

# --- Build (dependencies, nzyme cli, codegen, packages) ---

bash setup.build.sh

# --- Code index (agent navigation) ---

# Not part of setup.build.sh: CI has no agent to read it. Non-fatal — an indexing failure must never
# break workspace setup.
echo ""
echo "🗂️ Generating the code index..."
echo ""
bun run index || echo "⚠️  Code indexing failed (non-fatal) — run 'bun run index' manually."

echo ""
if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo "⚠️  Setup finished with skipped steps:"
    for warning in "${WARNINGS[@]}"; do
        echo "   - $warning"
    done
    echo ""
fi
echo "✅ Setup complete."
echo ""
