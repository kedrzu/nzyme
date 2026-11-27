import { Option } from '@nzyme/cli-core';
import { Command } from '@nzyme/cli-core/Command.js';
import { formatMachineCapacityStatus } from '@nzyme/machine/formatMachineCapacityStatus.js';
import type { MachineCapacityEnvironmentOptions } from '@nzyme/machine/MachineCapacityTypes.js';
import { readMachineCapacityStatus } from '@nzyme/machine/readMachineCapacityStatus.js';

/** Shows who holds and who waits for the machine's slots — without changing anything. */
export class MachineStatusCommand extends Command {
    static override paths = [['machine', 'status']];

    static override usage = Command.Usage({
        category: 'Machine',
        description: 'Show the slots, their holders and the queue of heavy runs on this machine',
        details: `
            Read-only snapshot of the registry shared by every repository on this machine: how many
            heavy runs it admits at once, who holds a slot, and the queue in admission order.
            \`--json\` prints the snapshot as JSON.
        `,
        examples: [
            ['Show the status', 'nzyme machine status'],
            ['Machine-readable status', 'nzyme machine status --json'],
        ],
    });

    json = Option.Boolean('--json', false, { description: 'Print the snapshot as JSON' });

    /** Where the registry lives and how many slots it has; tests override it. */
    environment: MachineCapacityEnvironmentOptions = {};

    /**
     * Execute the command.
     */
    override run() {
        const status = readMachineCapacityStatus(this.environment);

        if (this.json) {
            this.context.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
        } else {
            this.context.stdout.write(`${formatMachineCapacityStatus(status, Date.now()).join('\n')}\n`);
        }

        return 0;
    }
}
