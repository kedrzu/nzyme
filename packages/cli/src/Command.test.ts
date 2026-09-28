import { PassThrough } from 'node:stream';

import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { Cli } from 'clipanion';

import { createContainer } from '@nzyme/ioc/Container.js';

import type { CommandContext, CommandErrorHandler } from './Command.js';
import { Command } from './Command.js';

const thrown = new Error('the original failure');

/**
 * Fails on every run, so every run reaches `catch()`. Fails before `setup()` creates the logger, so
 * the base handler reports through `console.error` with the error object itself, observable as is.
 */
class FailingCommand extends Command {
    static override readonly paths = [['fail']];

    override async execute() {
        await Promise.resolve();
        throw thrown;
    }

    protected override run() {}
}

/** Thrown in place of a real `process.exit`, so the base handler's exit code stays observable. */
class ProcessExited extends Error {
    constructor(readonly code: number | string | null | undefined) {
        super(`process.exit(${String(code)})`);
    }
}

/** The details the base handler passed to `console.error`, one entry per report. */
let reported: unknown[] = [];
let exitCodes: (number | string | null | undefined)[] = [];
const spies: { mockRestore: () => void }[] = [];

beforeEach(() => {
    reported = [];
    exitCodes = [];
    spies.push(
        spyOn(process, 'exit').mockImplementation(code => {
            exitCodes.push(code);
            throw new ProcessExited(code);
        }),
        spyOn(console, 'error').mockImplementation((_message: unknown, details: unknown) => {
            reported.push(details);
        }),
    );
});

afterEach(() => {
    for (const spy of spies) {
        spy.mockRestore();
    }

    spies.length = 0;
});

test('the context `onError` handler rewrites the error a command reports, and it still exits 1', async () => {
    const received: unknown[] = [];

    const rewritten = new Error('the rewritten failure');

    // Async on purpose: the handler's result is awaited. (Not named `error` — see `Command.catch`.)
    await runFailing(async failure => {
        received.push(failure);
        await Promise.resolve();

        return rewritten;
    });

    expect(received).toEqual([thrown]);
    expect(reported).toEqual([{ error: rewritten }]);
    expect(exitCodes).toEqual([1]);
});

test('a handler returning nothing leaves the original error to be reported', async () => {
    await runFailing(() => null);

    expect(reported).toEqual([{ error: thrown }]);
    expect(exitCodes).toEqual([1]);
});

test('without a handler the original error is reported', async () => {
    await runFailing(undefined);

    expect(reported).toEqual([{ error: thrown }]);
    expect(exitCodes).toEqual([1]);
});

/** Runs {@link FailingCommand} through clipanion, the same path `execute()` takes. */
async function runFailing(onError: CommandErrorHandler | undefined) {
    const cli = new Cli<CommandContext>();
    cli.register(FailingCommand);

    // The mocked `process.exit` throws, which clipanion reports to `stdout` — swallow it there.
    await cli.run(['fail'], { container: createContainer(), onError, stdout: new PassThrough() });
}
