---
name: testing
description: >-
    Use before writing, changing or running any test (*.test.ts, component or e2e spec) — whether it is worth writing, createTestContainer, assertions, Vitest browser mode, Playwright.
---

Unit tests: `bun run test` (all, `bun test ./packages/*/src ./scripts`) or `bun test <path>`. Component tests: `bun run test:components` (Nx, `vitest run` per package). Matchers live in `packages/vitest`, container helpers in `packages/ioc-testing`.

Links in the document below are relative to its directory (`docs/practice/` here); package READMEs are `packages/<pkg>/README.md`.

!`cat docs/practice/testing.md 2>/dev/null || cat nzyme/docs/practice/testing.md`
