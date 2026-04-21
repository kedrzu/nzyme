import type { BaseContext, CommandClass as ClipanionCommandClass } from 'clipanion';
import { Command as ClipanionCommand } from 'clipanion';

import type { Container } from '@nzyme/ioc/Container.js';
import { defineScope } from '@nzyme/ioc/ContainerScope.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { PrettyCliLoggerTransport } from '@nzyme/logging/PrettyCliLoggerTransport.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';
import { getClassName } from '@nzyme/utils/getClassName.js';

/** Clipanion command context extended with an IoC container. */
export interface CommandContext extends BaseContext {
    /** The IoC container available to all commands. */
    container: Container;
}

/** Scope identifier for command-level IoC container isolation. */
export const CommandScope = defineScope('command');

/** A Clipanion command class with the CommandContext. */
export type CommandClass = ClipanionCommandClass<CommandContext>;

/** Base class for CLI commands with IoC container, logging, and lifecycle events. */
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

    /** The command's scoped IoC container. Throws if accessed before setup. */
    public get container(): Container {
        if (!this.#container) {
            throw new Error('Not initialized yet');
        }

        return this.#container;
    }

    /** The command's logger instance. Throws if accessed before setup. */
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

    /** Runs the command lifecycle: setup, beforeRun, run, afterRun, cleanup. */
    override async execute() {
        await this.setup();
        try {
            await this.beforeRunEvent.emitAsync();
            const result = await this.run();
            await this.afterRunEvent.emitAsync();
            return result;
        } finally {
            await this.cleanupEvent.emitAsync();
        }
    }

    /** Logs the error and exits the process with code 1. */
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
