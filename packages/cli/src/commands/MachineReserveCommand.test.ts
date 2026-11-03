import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';

import { afterEach, expect, test } from 'bun:test';
import { Cli } from 'clipanion';

import { createContainer } from '@nzyme/ioc/Container.js';
import { GiB } from '@nzyme/machine/byteUnits.js';
import type { MachineCapacityEnvironmentOptions } from '@nzyme/machine/MachineCapacityTypes.js';
import { readMachineCapacityStatus } from '@nzyme/machine/readMachineCapacityStatus.js';
import { assert } from '@nzyme/utils/assert.js';

import type { CommandContext } from '@nzyme/cli-core/Command.js';
import { MachineReserveCommand } from './MachineReserveCommand.js';

const owners: ChildProcess[] = [];

afterEach(() => {
    for (const owner of owners.splice(0)) {
        owner.kill('SIGKILL');
    }
});

test('a request that can never fit exits 1 with the numbers on stderr', async () => {
    const environment = await createEnvironment(1 * GiB);
    const owner = spawnOwner();

    const result = await runReserve(environment, [
        '--label',
        'tests',
        '--pid',
        String(owner.pid),
        '--base',
        '32GiB',
        '--per-worker',
        '1GiB',
        '--min',
        '1',
        '--max',
        '1',
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('nzyme machine reserve: Machine capacity request tests needs at least');
    expect(readMachineCapacityStatus(environment).holders).toEqual([]);
});

test('prints only the worker count on stdout and leaves the reservation to --pid', async () => {
    const environment = await createEnvironment(8 * GiB);
    const owner = spawnOwner();

    const result = await runReserve(environment, [
        '--label',
        'tests',
        '--pid',
        String(owner.pid),
        '--base',
        '1GiB',
        '--per-worker',
        '2048MiB',
        '--min',
        '1',
        '--max',
        '2',
    ]);

    expect(result).toMatchObject({ exitCode: 0, stdout: '2\n' });
    expect(result.stderr).toContain('[nzyme machine] tests: reserved 5.0 GiB for 2 workers');

    // The command has returned; the reservation outlives it, bound to the owner.
    expect(readMachineCapacityStatus(environment).holders).toMatchObject([
        { label: 'tests', ownerPid: owner.pid, workers: 2, bytes: 5 * GiB },
    ]);
});

/** A private registry on a machine with `availableBytes` free of 16 GiB, and idle CPU. */
async function createEnvironment(availableBytes: number): Promise<MachineCapacityEnvironmentOptions> {
    return {
        rootDir: await mkdtemp(path.join(os.tmpdir(), 'machine-reserve-')),
        reserveBytes: 0,
        readAvailableMemory: () => availableBytes,
        readTotalMemory: () => 16 * GiB,
        readCpuLoad: () => ({ cores: 8, load1m: 0, load5m: 0, load15m: 0 }),
    };
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
