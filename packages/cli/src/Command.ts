import type { BaseContext, CommandClass as ClipanionCommandClass } from 'clipanion';
import { Command as ClipanionCommand } from 'clipanion';

import type { Container } from '@nzyme/ioc';
import { defineScope } from '@nzyme/ioc';
import { Logger, PrettyLogger } from '@nzyme/logging';

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
    protected get container(): Container {
        if (!this.#container) {
            throw new Error('Not initialized yet');
        }

        return this.#container;
    }

    #container: Container | null = null;

    /**
     *
     */
    override async execute() {
        await this.setup();
        return await this.run();
    }

    protected setup(): Promise<void> {
        this.#container = this.context.container.createChild(CommandScope);
        this.#container.set(Logger, PrettyLogger);

        return Promise.resolve();
    }

    protected abstract run(): number | Promise<number | void> | void;
}
