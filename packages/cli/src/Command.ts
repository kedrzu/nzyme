import type { BaseContext, CommandClass as ClipanionCommandClass } from 'clipanion';
import { Command as ClipanionCommand } from 'clipanion';

import type { Container } from '@nzyme/ioc';
import { defineScope } from '@nzyme/ioc';
import { Logger, PrettyCliLoggerTransport } from '@nzyme/logging';
import { createEventEmitter, getClassName } from '@nzyme/utils';

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
     * Event emitter for the before run event
     */
    public get beforeRun() {
        return this.beforeRunEvent.event;
    }

    /**
     * Event emitter for the after run event
     */
    public get afterRun() {
        return this.afterRunEvent.event;
    }

    /**
     * Event emitter for the cleanup event
     */
    public get cleanup() {
        return this.cleanupEvent.event;
    }

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

    private readonly beforeRunEvent = createEventEmitter();
    private readonly afterRunEvent = createEventEmitter();
    private readonly cleanupEvent = createEventEmitter();

    #container: Container | null = null;
    #logger: Logger | null = null;

    /**
     *
     */
    override async execute() {
        await this.setup();
        try {
            await this.beforeRunEvent.emit.async();
            const result = await this.run();
            await this.afterRunEvent.emit.async();
            return result;
        } finally {
            await this.cleanupEvent.emit.async();
        }
    }

    /**
     *
     */
    override async catch(error: unknown) {
        if (this.#logger) {
            this.#logger.error('❌ Command execution failed', { error });
        } else {
            console.error('❌ Command execution failed', { error });
        }

        await Promise.resolve();
        process.exit(1);
    }

    protected setup(): Promise<void> {
        this.#container = this.context.container.createChild(CommandScope);
        this.#container.register(PrettyCliLoggerTransport);
        const transport = this.#container.resolve(PrettyCliLoggerTransport);
        this.#logger = Logger.create({ name: getClassName(this), transport });

        return Promise.resolve();
    }

    protected abstract run(): number | Promise<number | void> | void;
}
