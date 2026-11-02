import { formatMachineCapacityStatus } from '@nzyme/machine/formatMachineCapacityStatus.js';
import type { MachineCapacityEnvironmentOptions } from '@nzyme/machine/MachineCapacityTypes.js';
import { readMachineCapacityStatus } from '@nzyme/machine/readMachineCapacityStatus.js';

import { Command } from '../Command.js';
import { Option } from '../index.js';

/** Shows who holds and who waits for machine capacity, and what is free — without changing anything. */
export class MachineStatusCommand extends Command {
    static override paths = [['machine', 'status']];

    static override usage = Command.Usage({
        category: 'Machine',
        description: 'Show free memory, CPU load, reservations and the queue of the machine capacity registry',
        details: `
            Read-only snapshot of the registry shared by every repository on this machine: memory
            free for a new request, CPU load, each holder's reserved versus current memory, and the
            queue in admission order. \`--json\` prints the snapshot as JSON.
        `,
        examples: [
            ['Show the status', 'nzyme machine status'],
            ['Machine-readable status', 'nzyme machine status --json'],
        ],
    });

    json = Option.Boolean('--json', false, { description: 'Print the snapshot as JSON' });

    /** Where the registry lives and how the machine is read; tests override it. */
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
