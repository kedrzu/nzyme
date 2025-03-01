import chalk from 'chalk';
import consola from 'consola';

import { Caller, defineService } from '@nzyme/ioc';

import type { LoggerArgs } from './Logger.js';
import { Logger } from './Logger.js';
import { perf } from './perf.js';

export class PrettyLogger implements Logger {
    private readonly name: string | null;
    constructor(name: string = '') {
        this.name = name ? chalk.yellow(name) : null;
    }

    public error(error: unknown, args?: LoggerArgs): void;
    public error(message: string, args?: LoggerArgs): void;
    public error(message: unknown, args?: LoggerArgs): void {
        if (typeof message === 'string') {
            consola.error(this.format(message), args);
        } else {
            consola.error(this.name, message, args);
        }
    }

    public warn(message: string, args?: LoggerArgs): void {
        if (args) {
            consola.warn(this.format(message), args);
        } else {
            consola.warn(this.format(message));
        }
    }

    public info(message: string, args?: LoggerArgs): void {
        if (args) {
            consola.info(this.format(message), args);
        } else {
            consola.info(this.format(message));
        }
    }

    public success(message: string, args?: LoggerArgs): void {
        if (args) {
            consola.success(this.format(message), args);
        } else {
            consola.success(this.format(message));
        }
    }

    public debug(message: string, args?: LoggerArgs): void {
        if (args) {
            consola.debug(this.format(message), args);
        } else {
            consola.debug(this.format(message));
        }
    }

    public trace(message: string, args?: LoggerArgs): void {
        if (args) {
            consola.trace(this.format(message), args);
        } else {
            consola.trace(this.format(message));
        }
    }

    public measure(start: number, message: string) {
        const time = perf.format(start);
        const formatted = `${message}: ${time}`;
        this.info(formatted);
    }

    public context<T extends Record<string, unknown>>(
        name: string,
        ctx: T | null | undefined,
    ): void {
        consola.info(this.name, chalk.green(name), ctx);
    }

    private format(message: string) {
        return this.name ? `${this.name}: ${message}` : message;
    }
}

export const PrettyLoggerFactory = defineService({
    name: 'PrettyLogger',
    implements: Logger,
    resolution: 'transient',
    deps: {
        caller: Caller,
    },
    setup({ caller }) {
        return new PrettyLogger(caller?.name);
    },
});
