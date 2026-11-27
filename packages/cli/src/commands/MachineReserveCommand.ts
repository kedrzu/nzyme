import { Option, UsageError } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import { ApplicationError } from '@nzyme/logging/ApplicationError.js';
import { acquireMachineCapacity } from '@nzyme/machine/acquireMachineCapacity.js';
import { MACHINE_STATUS_PREFIX } from '@nzyme/machine/formatMachineCapacityStatus.js';
import type { MachineCapacityEnvironmentOptions } from '@nzyme/machine/MachineCapacityTypes.js';

/**
 * Takes one of the machine's slots for a heavy run that a shell starts next.
 *
 * The slot belongs to `--pid`, not to this process: a shell script reserves for itself
 * (`nzyme machine reserve --pid $$ …`), then runs the heavy command under that same pid, so the slot
 * is held exactly as long as the run. Status lines go to stderr; stdout stays empty.
 */
export class MachineReserveCommand extends Command {
    static override paths = [['machine', 'reserve']];

    static override usage = Command.Usage({
        category: 'Machine',
        description: "Wait for one of the machine's slots for heavy runs and hold it for a process",
        details: `
            Joins the machine-global queue shared by every repository on this machine and waits until
            fewer heavy runs than the machine's slots are running. The slot count is one per 20 GiB of
            memory, at least one; \`NZYME_MACHINE_SLOTS\` overrides it, and every repository on the
            machine should see the same value.

            The slot is held until \`--pid\` exits — this command exits as soon as it has it.

            Exits 1 with the holders on stderr when its place in the queue has not improved for 30
            minutes. A waiter killed by a signal stops counting, because its pid is dead.
        `,
        examples: [
            [
                'Take a slot for the current shell, then run tests in it',
                'nzyme machine reserve --label tests --pid $$ && bun test',
            ],
        ],
    });

    label = Option.String('--label', { required: true, description: 'Shown to other users of the machine' });

    pid = Option.String('--pid', { required: true, description: 'Process whose lifetime bounds the slot' });

    /** Where the registry lives and how many slots it has; tests override it. */
    environment: MachineCapacityEnvironmentOptions = {};

    /**
     * Execute the command.
     */
    override async run() {
        try {
            const ownerPid = readPid(this.pid);
            await acquireMachineCapacity({
                ...this.environment,
                label: this.label,
                ownerPid,
                onStatus: line => this.context.stderr.write(`${line}\n`),
            });

            this.context.stderr.write(
                `${MACHINE_STATUS_PREFIX}${this.label}: took a slot, held until pid ${ownerPid} exits\n`,
            );
            return 0;
        } catch (error) {
            if (error instanceof ApplicationError || error instanceof UsageError) {
                this.context.stderr.write(`nzyme machine reserve: ${error.message}\n`);
                return 1;
            }

            throw error;
        }
    }
}

function readPid(text: string): number {
    if (!/^\d+$/.test(text) || Number(text) < 1) {
        throw new UsageError(`--pid must be a positive integer, got "${text}"`);
    }

    return Number(text);
}
