#!/bin/zsh
# Workspace setup for a clone or a worktree (Paseo runs it for every new worktree — see paseo.json).
# The build itself lives in setup.build.sh, which CI runs too.
set -e

REPO_ROOT=$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\.git\(/.*\)*$||')
CURRENT_DIR=$(pwd -P)
IS_WORKTREE=false

if [ "$CI" != "true" ] && [ "$REPO_ROOT" != "$CURRENT_DIR" ]; then
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

    git fetch --quiet origin main

    # Fast-forward the local `main` too, so the NEXT worktree is not cut from a stale base. Git
    # refuses to move a branch another worktree holds, so ask that worktree — and only when clean.
    MAIN_WORKTREE=$(git worktree list --porcelain \
        | awk '/^worktree /{wt=$2} /^branch refs\/heads\/main$/{print wt; exit}')

    if [ -z "$MAIN_WORKTREE" ]; then
        git fetch --quiet origin main:main \
            || echo "⚠️  Local main not fast-forwarded (diverged from origin/main)."
    elif [ -n "$(git -C "$MAIN_WORKTREE" status --porcelain)" ]; then
        echo "⚠️  Local main left as it is — $MAIN_WORKTREE has uncommitted changes."
    else
        git -C "$MAIN_WORKTREE" merge --ff-only --quiet origin/main \
            || echo "⚠️  Local main not fast-forwarded (diverged from origin/main)."
    fi

    # A re-run on a branch carrying real work may not merge cleanly; a conflict under `set -e` would
    # leave a half-merged tree, so an unclean merge is rolled back and reported instead.
    if git merge --quiet --no-edit origin/main; then
        echo "✅ Up to date with origin/main"
    else
        git merge --abort 2> /dev/null || true
        echo "⚠️  Could not merge origin/main into $(git branch --show-current) — merge it by hand."
        echo "   Until then the build reflects this branch, not origin/main."
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

echo ""
echo "✅ Setup complete."
echo ""
