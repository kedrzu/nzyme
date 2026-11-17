import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

// The check runs through the real label runtime, so each case is a Bun process started with the probe.
const preloadPath = path.join(import.meta.dir, '../probe/preload.ts');

let root: string;

beforeAll(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'trace-effect-check-')));
    await writeFile(path.join(root, 'package.json'), '{ "name": "effect-check", "private": true, "type": "module" }');
    await writeFile(path.join(root, 'check.js'), checkScript());
});

afterAll(async () => {
    await rm(root, { recursive: true, force: true });
});

test('passes against the installed effect version, with the probe', async () => {
    expect(await runCheck('real', true)).toEqual({ ok: true });
});

test('fails loudly when labels stop reaching Effect.promise thunks', async () => {
    const result = await runCheck('broken', true);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Trace labels do not follow Effect fibers');
    expect(result.error).toContain('Effect.promise thunk: expected request-');
});

test('refuses to run without the probe', async () => {
    const result = await runCheck('real', false);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('needs the @nzyme/trace probe');
});

interface CheckResult {
    ok: boolean;
    error?: string;
}

async function runCheck(variant: 'real' | 'broken', withProbe: boolean) {
    const env: Record<string, string | undefined> = { ...process.env, CHECK_VARIANT: variant };
    delete env.BUN_OPTIONS;
    delete env.NZYME_TRACE_DIR;
    if (withProbe) {
        env.BUN_OPTIONS = `--preload=${preloadPath}`;
        env.NZYME_TRACE_DIR = path.join(root, `trace-${variant}`);
    }

    const child = Bun.spawn([process.execPath, 'check.js'], { cwd: root, env, stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ]);
    if (exitCode !== 0) {
        throw new Error(`check process failed (exit ${exitCode}):\n${stderr}`);
    }
    return JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as CheckResult;
}

function checkScript() {
    return `
import { Effect, Fiber, Queue } from ${JSON.stringify(import.meta.resolve('effect'))};
import { checkEffectLabelPropagation } from ${JSON.stringify(path.join(import.meta.dir, 'checkEffectLabelPropagation.ts'))};
import { traceScope } from ${JSON.stringify(path.join(import.meta.dir, '../runtime/traceScope.ts'))};

// "broken" stands for an effect version that no longer carries the context into promise thunks.
const effect = process.env.CHECK_VARIANT === 'broken'
    ? { ...Effect, promise: evaluate => Effect.promise(signal => traceScope(undefined, () => evaluate(signal))) }
    : Effect;

try {
    await checkEffectLabelPropagation({ Effect: effect, Fiber, Queue });
    console.log(JSON.stringify({ ok: true }));
} catch (error) {
    console.log(JSON.stringify({ ok: false, error: error.message }));
}
`;
}
