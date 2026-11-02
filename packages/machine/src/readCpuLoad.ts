import { availableParallelism, loadavg } from 'node:os';

/** CPU parallelism of the machine and its recent load. */
export interface CpuLoad {
    /** Logical cores this process may use. */
    cores: number;
    /** Run-queue length averaged over the last minute. */
    load1m: number;
    /** Run-queue length averaged over the last five minutes. */
    load5m: number;
    /** Run-queue length averaged over the last fifteen minutes. */
    load15m: number;
}

/**
 * Reads core count and load averages.
 * @util
 */
export function readCpuLoad(): CpuLoad {
    const [load1m = 0, load5m = 0, load15m = 0] = loadavg();

    return { cores: availableParallelism(), load1m, load5m, load15m };
}
