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

# --- Worktree: catch up with the branch's base before anything is compiled ---

# A worktree is cut from the *local* `main` (a feature) or `release` (a hotfix), which may have fallen
# behind origin. Catching up with that base here means the build matches the commit the task branch
# will sit on — and never with the other one: merging main into a hotfix would ship main with it.
# Worktrees only: in a plain clone the branch you are on is a deliberate choice, and setup has no
# business merging into it.
if [ "$IS_WORKTREE" = true ]; then
    BRANCH=$(git branch --show-current)

    # The base, most authoritative first: the open PR's, then the one recorded on the first run.
    BASE=$(gh pr view --json baseRefName --jq .baseRefName 2> /dev/null || true)
    if [ -z "$BASE" ]; then
        BASE=$(git config "branch.$BRANCH.gh-merge-base" 2> /dev/null || true)
    fi

    # First run: Paseo has just cut the branch, so HEAD still sits on the tip of its local base — read
    # before that ref is fast-forwarded below. Ancestry cannot tell the bases apart (after a back-merge
    # release is an ancestor of main), but the tip can. On a tie `release` wins: merging it into a
    # feature branch is harmless, merging main into a hotfix is the harm. Only an unambiguous base is
    # recorded, since `gh pr create` also reads the key as its default base.
    if [ -z "$BASE" ] && [ -n "$BRANCH" ]; then
        HEAD_SHA=$(git rev-parse HEAD)
        MAIN_SHA=$(git rev-parse --verify --quiet refs/heads/main || true)
        RELEASE_SHA=$(git rev-parse --verify --quiet refs/heads/release || true)

        if [ "$HEAD_SHA" = "$RELEASE_SHA" ]; then
            BASE=release
        elif [ "$HEAD_SHA" = "$MAIN_SHA" ]; then
            BASE=main
        fi
        if [ -n "$BASE" ] && [ "$MAIN_SHA" != "$RELEASE_SHA" ]; then
            git config "branch.$BRANCH.gh-merge-base" "$BASE"
        fi
    fi

    if [ -z "$BASE" ]; then
        warn "Not caught up: ${BRANCH:-detached HEAD} has no PR and is not at the tip of main or release, so its base is unknown — merge it by hand if needed."
    elif [ "$BASE" != main ] && [ "$BASE" != release ]; then
        warn "Not caught up: $BRANCH is based on $BASE, a stacked node — only the stack's bottom node merges in main or release."
    else
        echo ""
        echo "🔄 Catching up with origin/$BASE..."
        echo ""

        if ! git fetch --quiet origin "$BASE"; then
            warn "Could not fetch origin/$BASE (offline?) — the build reflects this branch, not origin/$BASE."
        else
            # Fast-forward the local base too, so the NEXT worktree is not cut from a stale one. Git
            # refuses to move a branch another worktree holds, so ask that worktree — and only when clean.
            BASE_WORKTREE=$(git worktree list --porcelain \
                | awk -v ref="branch refs/heads/$BASE" '/^worktree /{wt=substr($0, 10)} $0 == ref {print wt; exit}')

            if [ -z "$BASE_WORKTREE" ]; then
                git fetch --quiet origin "$BASE:$BASE" \
                    || warn "Local $BASE not fast-forwarded (diverged from origin/$BASE)."
            elif [ -n "$(git -C "$BASE_WORKTREE" status --porcelain)" ]; then
                warn "Local $BASE left as it is — $BASE_WORKTREE has uncommitted changes."
            else
                git -C "$BASE_WORKTREE" merge --ff-only --quiet "origin/$BASE" \
                    || warn "Local $BASE not fast-forwarded (diverged from origin/$BASE)."
            fi

            # A re-run on a branch carrying real work may not merge cleanly; a conflict under `set -e`
            # would leave a half-merged tree, so an unclean merge is rolled back and reported instead.
            if git merge --quiet --no-edit "origin/$BASE"; then
                echo "✅ Up to date with origin/$BASE"
            else
                git merge --abort 2> /dev/null || true
                warn "Could not merge origin/$BASE into $BRANCH — merge it by hand. Until then the build reflects this branch, not origin/$BASE."
            fi
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
