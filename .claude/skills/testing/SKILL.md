---
name: testing
description: Writing, running and judging tests in this repo: whether a test is worth writing, bun:test unit and integration tests with createTestContainer, assertions, @nzyme/vitest matchers, component tests in Vitest browser mode, Playwright e2e. Use when writing, reviewing or debugging any test, or deciding whether a change needs one.
---

Unit tests: `bun run test` (all, `bun test ./packages/*/src ./scripts`) or `bun test <path>`. Component tests: `bun run test:components` (Nx, `vitest run` per package). Matchers live in `packages/vitest`, container helpers in `packages/ioc-testing`.

!`cat docs/practice/testing.md 2>/dev/null || cat nzyme/docs/practice/testing.md`
