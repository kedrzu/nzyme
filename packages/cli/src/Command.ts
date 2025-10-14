import type { BaseContext, CommandClass as ClipanionCommandClass } from 'clipanion';
import { Command as ClipanionCommand } from 'clipanion';

import type { Container } from '@nzyme/ioc';
import { defineScope } from '@nzyme/ioc';
import { Logger, PrettyLoggerTransport } from '@nzyme/logging';
import { getClassName } from '@nzyme/utils';

/**
 *
 */
export interface CommandContext extends BaseContext {
    /**
     *
     */
    container: Container;
}

/**
 *
 */
export const CommandScope = defineScope('command');

/**
 *
 */
export type CommandClass = ClipanionCommandClass<CommandContext>;

/**
 *
 */
export abstract class Command extends ClipanionCommand<CommandContext> {
    /**
     *
     */
    public get container(): Container {
        if (!this.#container) {
            throw new Error('Not initialized yet');
        }

        return this.#container;
    }

    /**
     *
     */
    public get logger(): Logger {
        if (!this.#logger) {
            throw new Error('Not initialized yet');
        }

        return this.#logger;
    }

    #container: Container | null = null;
    #logger: Logger | null = null;

    /**
     *
     */
    override async execute() {
        await this.setup();
        return await this.run();
    }

    protected setup(): Promise<void> {
        this.#container = this.context.container.createChild(CommandScope);
        this.#container.register(PrettyLoggerTransport);
        const transport = this.#container.resolve(PrettyLoggerTransport);
        this.#logger = Logger.create({ name: getClassName(this), transport });

        return Promise.resolve();
    }

    protected abstract run(): number | Promise<number | void> | void;
}
