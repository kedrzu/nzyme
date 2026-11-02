import { createCapacityRegistry } from './createCapacityRegistry.js';
import type { MachineCapacityEnvironmentOptions, MachineCapacityStatus } from './MachineCapacityTypes.js';

/**
 * Snapshots the machine and the machine-global capacity registry without changing anything: dead
 * records are left for the next admission decision to delete.
 */
export function readMachineCapacityStatus(options: MachineCapacityEnvironmentOptions = {}): MachineCapacityStatus {
    return createCapacityRegistry(options).readState(false).status;
}
