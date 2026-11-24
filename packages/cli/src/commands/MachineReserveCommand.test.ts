import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';

import { afterEach, expect, test } from 'bun:test';
import { Cli } from 'clipanion';

import { createContainer } from '@nzyme/ioc/Container.js';
import type { MachineCapacityEnvironmentOptions } from '@nzyme/machine/MachineCapacityTypes.js';
import { readMachineCapacityStatus } from '@nzyme/machine/readMachineCapacityStatus.js';
import { assert } from '@nzyme/utils/assert.js';
import { waitUntil } from '@nzyme/utils/waitUntil.js';

import type { CommandContext } from '@nzyme/cli-core/Command.js';
import { MachineReserveCommand } from './MachineReserveCommand.js';

const owners: ChildProcess[] = [];

afterEach(() => {
    for (const owner of owners.splice(0)) {
        owner.kill('SIGKILL');
    }
});

test('holds a slot for --pid after it returns, and a full machine makes the next request wait', async () => {
    const environment = await createEnvironment();
    const owner = spawnOwner();

    const result = await runReserve(environment, ['--label', 'tests', '--pid', String(owner.pid)]);

    expect(result).toMatchObject({ exitCode: 0, stdout: '' });
    expect(result.stderr).toContain(`[nzyme machine] tests: took a slot, held until pid ${owner.pid} exits`);
    // The command has returned; the slot outlives it, bound to the owner.
    expect(readMachineCapacityStatus(environment).holders).toMatchObject([{ label: 'tests', ownerPid: owner.pid }]);

    const second = spawnOwner();
    let finished = false;
    const pending = runReserve(environment, ['--label', 'second', '--pid', String(second.pid)]).then(next => {
        finished = true;
        return next;
    });
    await waitUntil(() => readMachineCapacityStatus(environment).waiters.length === 1);
    expect(finished).toBe(false);

    owner.kill('SIGKILL');
    expect(await pending).toMatchObject({ exitCode: 0 });
});

test('a malformed --pid exits 1 without joining the queue', async () => {
    const environment = await createEnvironment();

    const result = await runReserve(environment, ['--label', 'tests', '--pid', 'self']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--pid must be a positive integer');
    expect(readMachineCapacityStatus(environment).waiters).toEqual([]);
});

/** A private registry with one slot. */
async function createEnvironment(): Promise<MachineCapacityEnvironmentOptions> {
    return { rootDir: await mkdtemp(path.join(os.tmpdir(), 'machine-reserve-')), slots: 1 };
}

/** A live process for the reservation to belong to — the role a shell plays for a real run. */
function spawnOwner(): ChildProcess {
    const owner = spawn('sleep', ['60'], { stdio: 'ignore' });
    owners.push(owner);
    return owner;
}

/** Runs `machine reserve` through clipanion in this process, with the registry and readings injected. */
async function runReserve(environment: MachineCapacityEnvironmentOptions, args: string[]) {
    const stdout = createTextSink();
    const stderr = createTextSink();
    const context = { container: createContainer(), stdout: stdout.stream, stderr: stderr.stream };

    const cli = new Cli<CommandContext>();
    cli.register(MachineReserveCommand);
    const command = cli.process(['machine', 'reserve', ...args], context);
    assert(command instanceof MachineReserveCommand);
    command.environment = environment;

    const exitCode = await cli.run(command, context);
    return { exitCode, stdout: stdout.text(), stderr: stderr.text() };
}

function createTextSink() {
    let text = '';
    const stream = new Writable({
        write(chunk: Buffer | string, _encoding, callback) {
            text += chunk.toString();
            callback();
        },
    });

    return { stream, text: () => text };
}
