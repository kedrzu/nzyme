#!/usr/bin/env bash
# Everything needed to compile the repo, and nothing else: dependencies, the nzyme CLI, generated
# code (per-package tsconfigs, `.loc.ts` translations), and the package builds.
#
# Shared by setup.sh (local and worktree setup) and CI (.github/workflows/ci.yml), so what CI proves
# is exactly what a local build does.
#
# bash rather than zsh: the GitHub-hosted runners have bash, and nothing here needs zsh.
set -e

step() {
    echo ""
    echo "$1"
    echo ""
}

step "📦 Installing dependencies..."
if [ "$CI" = "true" ]; then
    bun install --frozen-lockfile
else
    bun install
fi

# The CLI generates the per-package tsconfigs and translations everything else compiles against, so
# it has to exist before any of that runs.
step "🔨 Building nzyme cli..."
bun nx run @nzyme/cli:build

step "🛠️ Generating tsconfigs and translations..."
bun run monorepo
bun run localise

# @nzyme/logging-ui is excluded: it is a private, unpublished dev-tool app whose Nuxt deps (h3,
# vue-json-pretty styles) are under-declared, so it only builds when hoisting rescues it inside a
# consuming monorepo. Nothing depends on it. Every published package is still built here — and the
# tests need those dist outputs.
step "📝 Building packages..."
bun run build --exclude=@nzyme/logging-ui
