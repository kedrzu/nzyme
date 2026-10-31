# Nx and parallel worktrees

Nx runs the builds, caches them, and fans tasks out across packages. The reference configuration is
tuned for many worktrees open at once (one per Paseo task) on one machine, and for a cache that
never serves a stale build: a stale cache hit reports green on code that was never built.

## Reference state

- `nx.json` — `assets/nx.json.tmpl`, whole.
- `project.json` at the root — `assets/project.json.tmpl`: the `{{name}}-root` project with the
  generators and watchers as targets (`localise`, `monorepo`, their `watch:` variants, `watch:tsc`),
  so `nx run-many -t codegen,localise,monorepo` and `-t dev,watch:localise` reach them.
- `nx.includedScripts: []` in the root `package.json` (`references/monorepo.md`).
- `scripts/nxInputs.test.ts` — the guard test below — with `scripts/tsconfig.json`, run by the `tests`
  script and type-checked by `typecheck` (`assets/package.json.tmpl`).

What each part of `nx.json` is for:

- **`useDaemonProcess: false`.** Why: `docs/submodule-setup.md#nx`; in practice one daemon spun at
  100% CPU for 21 days. Only `NX_DAEMON=true` overrides it; keep it out of scripts
  and env files.
- **No submodule inputs.** nzyme's packages are workspace projects, so Nx hashes their files from the
  working tree like any project's, through `^production`/`^default` (Nx 23; checked 2026-10-31).
  `docs/submodule-setup.md#nx` (nzyme's docs, `../../../../docs/submodule-setup.md` from this skill).
- **`production`** drops tests and snapshots with exactly `!{projectRoot}/**/?(*.)+(spec|test).[jt]s?(x)`.
  A trailing `?` (`s?(x)?`) once made the extglob match every file, so `production` held none of the
  project's sources and every `build` was a permanent cache hit.
- **`localEnvironment`** (`ENV`) is in every cached target: a build for one environment never
  restores one made for another.
- **`appEnvironment: []`** and the gitignored-input rule below.
- **`tui.autoExit: true`** skips the 3-second countdown whose performance-report popup flashes after
  every multi-task run; **`analytics: false`** stops usage reports to Google Analytics.
- **`targetDefaults`**: cached `build` (with `^build` first), `prep` (`nuxt prepare`, output
  `.nuxt`), `typecheck` (after `prep`) and `test:stories`; uncached `codegen`; continuous `dev` and
  `watch`. A target the repo has none of costs nothing.

## A gitignored file that changes a build's output

Nx hashes only files git can see. A gitignored file — an app's `.env.<ENV>` that the build bakes
into the bundle, a per-worktree config — appears in no task's hash, and a `fileset` input naming it
changes nothing. A cache hit then restores a build made with another worktree's file (in the product
this came from: apps signing in against another worktree's auth pool, ~40 e2e timeouts on the login
screen).

**Rule:** hash such a file with a `runtime` input, in the `package.json` of the package that reads it,
overriding the empty `appEnvironment` that `nx.json` declares and the `build` target lists:

```json
"nx": {
    "namedInputs": {
        "appEnvironment": [
            { "runtime": "cat packages/app/.env packages/app/.env.${ENV:-dev} 2>/dev/null | git hash-object --stdin" }
        ]
    }
}
```

- A runtime input runs from the workspace root and gets no `{projectRoot}` interpolation, so spell
  the path out.
- Hash the whole file, not named variables: whatever is added to it next is covered without a config
  change.
- Empty at workspace level, so a library that bakes nothing is not invalidated by an app's env.
- A file that changes another target's output (not `build`) gets its own empty named input in
  `nx.json`, listed in that target's `inputs`, overridden the same way.
- Every such input gets a row in the guard test's `GITIGNORED_INPUTS`.

## The guard test

Each of the failures above is silent: the build succeeds from cache and reports green. The test
fails when a cached task's key stops changing with the project's own sources, with a source file of
an nzyme package it depends on, or with a declared gitignored input. It reads the inputs Nx itself
resolves (`HashPlanInspector`): sources and the nzyme probe must be among a task's files; for a
gitignored input it runs the task's `runtime` commands, changes the file, and asserts some command
printed something different. The file is restored (or deleted, if it did not exist) in `finally`; the test briefly
edits the working tree, so do not run it alongside a build.

`scripts/nxInputs.test.ts`:

```ts
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from 'bun:test';
import { readNxJson } from 'nx/src/config/nx-json.js';
import type { ProjectGraph } from 'nx/src/config/project-graph.js';
import { HashPlanInspector } from 'nx/src/hasher/hash-plan-inspector.js';
import { createProjectGraphAsync } from 'nx/src/project-graph/project-graph.js';
import { workspaceRoot } from 'nx/src/utils/workspace-root.js';

/**
 * Gitignored files that change a build's output. Each must be hashed by a `runtime` input of the
 * listed tasks — a fileset cannot see a gitignored file. Add a row with every such input.
 */
const GITIGNORED_INPUTS: GitignoredInput[] = [
    // { file: 'packages/app/.env', tasks: ['{{scope}}/app:build'] },
];

/** A source file of an nzyme package the product's projects depend on. */
const NZYME_PROBE = 'nzyme/packages/utils/src/index.ts';

interface GitignoredInput {
    /** Workspace-relative path of the file. */
    file: string;

    /** `project:target` ids whose cache key must change with the file. */
    tasks: string[];
}

interface CachedTask {
    /** `project:target`, e.g. `@scope/app:build`. */
    id: string;

    /** Workspace-relative path of the project, e.g. `packages/app`. */
    projectRoot: string;

    /** Workspace-relative paths of the files Nx hashes for this task. */
    files: string[];

    /** `runtime` input commands Nx runs for this task. */
    runtime: string[];

    /** Workspace-relative paths of the projects the task's project depends on, transitively. */
    dependencyRoots: string[];
}

// Resolving the inputs builds the whole project graph, so every assertion shares one run.
test('every cached Nx task is invalidated by its own sources, the nzyme packages it uses and its gitignored inputs', async () => {
    const tasks = await resolveCachedTasks();
    expect(tasks.length).toBeGreaterThan(0);

    // A namedInputs edit that drops a project's own files (a malformed extglob once collapsed
    // `production` to nothing) leaves a task that never misses the cache.
    expect(tasks.filter(task => !task.files.some(file => isOwnSource(task, file))).map(task => task.id)).toEqual([]);
    expect(tasks.filter(task => task.id.endsWith(':build')).flatMap(task => task.files.filter(isTestFile))).toEqual([]);

    // nzyme's packages are workspace projects: a product task over one hashes its files through `^` inputs.
    const overNzyme = tasks.filter(
        task =>
            !task.projectRoot.startsWith('nzyme/') &&
            task.dependencyRoots.some(root => NZYME_PROBE.startsWith(`${root}/`)),
    );
    expect(overNzyme.length).toBeGreaterThan(0);
    expect(overNzyme.filter(task => !task.files.includes(NZYME_PROBE)).map(task => task.id)).toEqual([]);

    for (const input of GITIGNORED_INPUTS) {
        const covered = tasks.filter(task => input.tasks.includes(task.id));
        expect(covered.map(task => task.id).toSorted()).toEqual(input.tasks.toSorted());
        expect(tasksBlindTo(covered, input.file)).toEqual([]);
    }
});

async function resolveCachedTasks(): Promise<CachedTask[]> {
    const nxJson = readNxJson();
    // A `targetDefaults` value is a config object or an array of filtered entries, each with its own `cache`.
    const cachedTargets = Object.entries(nxJson.targetDefaults ?? {})
        .filter(([, config]) =>
            Array.isArray(config) ? config.some(entry => entry.cache === true) : config.cache === true,
        )
        .map(([target]) => target);

    const graph = await createProjectGraphAsync({ exitOnError: false });
    const inspector = new HashPlanInspector(graph);
    await inspector.init();

    const tasks: CachedTask[] = [];
    for (const [project, node] of Object.entries(graph.nodes)) {
        for (const target of cachedTargets) {
            if (!node.data.targets?.[target]) {
                continue;
            }
            const id = `${project}:${target}`;
            const inputs = inspector.inspectTaskInputs({ project, target }, {}, undefined, true)[id];
            if (inputs) {
                tasks.push({
                    id,
                    projectRoot: node.data.root,
                    files: inputs.files,
                    runtime: inputs.runtime,
                    dependencyRoots: dependenciesOf(graph, project).map(name => graph.nodes[name]?.data.root ?? name),
                });
            }
        }
    }
    return tasks;
}

/** Names of the projects `project` depends on, transitively. */
function dependenciesOf(graph: ProjectGraph, project: string): string[] {
    const seen = new Set<string>();
    const queue = [project];
    for (const current of queue) {
        for (const dependency of graph.dependencies[current] ?? []) {
            if (!seen.has(dependency.target)) {
                seen.add(dependency.target);
                queue.push(dependency.target);
            }
        }
    }
    return [...seen];
}

/**
 * Changes `file` (or creates it), and returns the ids of the tasks none of whose runtime commands
 * print anything different. The file is restored before returning.
 */
function tasksBlindTo(tasks: readonly CachedTask[], file: string): string[] {
    const commands = [...new Set(tasks.flatMap(task => task.runtime))];
    const before = new Map(commands.map(command => [command, runCommand(command)]));

    const absolute = path.join(workspaceRoot, file);
    const original = existsSync(absolute) ? readFileSync(absolute) : undefined;
    try {
        // A trailing newline keeps the file valid whatever its format.
        writeFileSync(absolute, Buffer.concat([original ?? Buffer.from('NX_INPUTS_GUARD=1'), Buffer.from('\n')]));
        const changed = new Set(commands.filter(command => runCommand(command) !== before.get(command)));
        return tasks.filter(task => !task.runtime.some(command => changed.has(command))).map(task => task.id);
    } finally {
        if (original === undefined) {
            rmSync(absolute);
        } else {
            writeFileSync(absolute, original);
        }
    }
}

/** Runs a runtime input the way Nx does: through a shell, from the workspace root. */
function runCommand(command: string): string {
    const result = Bun.spawnSync(['sh', '-c', command], { cwd: workspaceRoot });
    if (result.exitCode !== 0) {
        throw new Error(`Runtime input failed (${result.exitCode}): ${command}\n${result.stderr.toString()}`);
    }
    return result.stdout.toString();
}

/** A file of the task's project other than its config, which Nx hashes whatever the inputs say. */
function isOwnSource(task: CachedTask, file: string): boolean {
    return (
        file.startsWith(`${task.projectRoot}/`) &&
        file !== `${task.projectRoot}/package.json` &&
        file !== `${task.projectRoot}/project.json`
    );
}

function isTestFile(file: string): boolean {
    return /\.(test|spec)\.[jt]sx?$/.test(file);
}
```

`scripts/tsconfig.json` (hand-written, un-ignored in `assets/gitignore.tmpl`):

```json
{
    "extends": "@nzyme/tsconfig/esm.json",
    "compilerOptions": { "noEmit": true, "composite": false, "incremental": false, "types": ["bun"] },
    "include": ["."]
}
```

- The `nx/src/...` imports are Nx internals, not its public API; they exist in the Nx version nzyme
  pins. If an Nx bump moves them, fix the imports — never delete the test.
- Own sources exclude the project's `package.json` and `project.json`: Nx hashes those whatever
  `inputs` say, so counting them would pass a task whose sources dropped out.
- Proven against a scratch product (nzyme as a submodule, an app with an `appEnvironment` override):
  green on the reference, red on each of — `production` narrowed to `{projectRoot}/src/**/*`,
  `{projectRoot}/**/*` removed from `default`, `^production` removed from `build` inputs, `^default`
  removed from the others, the app's override removed, `appEnvironment` removed from `build` inputs,
  the `s?(x)?` extglob (checked 2026-10-31, Nx 23.3.1).
- `production` without `{projectRoot}/**/*` stays green, rightly: a fileset of only exclusions
  matches every other project file.

## Placeholders

- `{{name}}` in `project.json` — the root package name.
- `{{scope}}` in the commented `GITIGNORED_INPUTS` row — the product's npm scope; fill a row per
  runtime input the repo declares, or leave the list empty.
- `NZYME_PROBE` — a source file of an nzyme package the product depends on; `utils` suits every
  product.

## Compare

- `nx.json`: key-wise merge; repo-only named inputs, target defaults and plugins stay. A difference in
  `useDaemonProcess`, the `production` exclusions or `appEnvironment` is always shown, even when the
  rest matches. `submoduleDefault`/`submoduleProduction` runtime inputs from an older reference are
  redundant: propose removing them.
- Gitignored inputs: look for build-time code that reads a gitignored file (`nuxt.config.ts`,
  `vite.config.ts`, a Nuxt module: `readFileSync`, `loadEnv`, `dotenv`, `--env-file`). Each one without
  a runtime input is a difference: propose the override and the guard row.
- A `fileset` input naming a gitignored file does nothing: replace it with a runtime input, or drop
  it if the file reaches no output.
- No guard test, or one checking only own sources: propose the skeleton above. Run it before
  reporting the element done.
- Turbo or no task runner: propose Nx with this configuration. The env-file rule and the guard
  are written for Nx.
