import { Option, UsageError } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import { ApplicationError } from '@nzyme/logging/ApplicationError.js';
import { acquireMachineCapacity } from '@nzyme/machine/acquireMachineCapacity.js';
import { formatBytes } from '@nzyme/machine/formatBytes.js';
import { MACHINE_STATUS_PREFIX } from '@nzyme/machine/formatMachineCapacityStatus.js';
import type { MachineCapacityEnvironmentOptions } from '@nzyme/machine/MachineCapacityTypes.js';

import { parseByteSize } from '../machine/parseByteSize.js';

/**
 * Reserves machine capacity for a heavy run that a shell starts next, and prints its worker count.
 *
 * The reservation belongs to `--pid`, not to this process: a shell script reserves for itself
 * (`W=$(nzyme machine reserve --pid $$ …)`), then `exec`s the heavy command under that same pid, so
 * the reservation lasts exactly as long as the run. Stdout carries nothing but the worker count, so
 * the script can capture it; every status line goes to stderr.
 */
export class MachineReserveCommand extends Command {
    static override paths = [['machine', 'reserve']];

    static override usage = Command.Usage({
        category: 'Machine',
        description: 'Wait for machine capacity, reserve it for a process and print the worker count',
        details: `
            Joins the machine-global queue shared by every repository on this machine, waits until
            memory and CPU allow at least \`--min\` workers, and reserves
            \`--base + W × --per-worker\` bytes for the largest W up to \`--max\`. Prints only W (and a
            newline) to stdout; status goes to stderr.

            The reservation is held until \`--pid\` exits — this command exits right after printing.
            Sizes accept plain bytes or a binary unit: \`512MiB\`, \`2GiB\`.

            Exits 1 with the numbers on stderr when the request can never fit this machine, or when
            its place in the queue has not improved for 30 minutes. A waiter killed by a signal stops
            counting, because its pid is dead.
        `,
        examples: [
            [
                'Reserve for the current shell, then run tests in it',
                'W=$(nzyme machine reserve --label tests --pid $$ --base 2GiB --per-worker 1GiB --min 1 --max 8)',
            ],
        ],
    });

    label = Option.String('--label', { required: true, description: 'Shown to other users of the machine' });

    pid = Option.String('--pid', { required: true, description: 'Process whose lifetime bounds the reservation' });

    base = Option.String('--base', { required: true, description: 'Memory the run needs regardless of workers' });

    perWorker = Option.String('--per-worker', { required: true, description: 'Memory each worker adds' });

    min = Option.String('--min', { required: true, description: 'Fewest workers the run can use' });

    max = Option.String('--max', { required: true, description: 'Most workers the run can use' });

    /** Where the registry lives and how the machine is read; tests override it. */
    environment: MachineCapacityEnvironmentOptions = {};

    /**
     * Execute the command.
     */
    override async run() {
        try {
            const request = this.readRequest();
            const reservation = await acquireMachineCapacity({
                ...this.environment,
                ...request,
                onStatus: line => this.context.stderr.write(`${line}\n`),
            });

            this.context.stderr.write(
                `${MACHINE_STATUS_PREFIX}${request.label}: reserved ${formatBytes(reservation.bytes)} for ` +
                    `${reservation.workers} workers, held until pid ${request.ownerPid} exits\n`,
            );
            this.context.stdout.write(`${reservation.workers}\n`);
            return 0;
        } catch (error) {
            if (error instanceof ApplicationError || error instanceof UsageError) {
                this.context.stderr.write(`nzyme machine reserve: ${error.message}\n`);
                return 1;
            }

            throw error;
        }
    }

    /** The request in library terms; throws a {@link UsageError} for a malformed option. */
    private readRequest() {
        return {
            label: this.label,
            ownerPid: readInteger('--pid', this.pid, 1),
            memory: {
                base: readByteSize('--base', this.base),
                perWorker: readByteSize('--per-worker', this.perWorker),
            },
            workers: { min: readInteger('--min', this.min, 1), max: readInteger('--max', this.max, 1) },
        };
    }
}

function readByteSize(option: string, text: string): number {
    const bytes = parseByteSize(text);
    if (bytes === undefined) {
        throw new UsageError(`${option} must be a byte size such as 1073741824, 512MiB or 2GiB, got "${text}"`);
    }

    return bytes;
}

function readInteger(option: string, text: string, min: number): number {
    const value = Number(text);
    if (!/^\d+$/.test(text) || value < min) {
        throw new UsageError(`${option} must be an integer of at least ${min}, got "${text}"`);
    }

    return value;
}
