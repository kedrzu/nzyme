import { automation } from '@pulumi/pulumi';

import type { StackDefinition } from './defineStack.js';

/**
 * Options for the {@link createOrSelectStack} function.
 */
export interface CreateOrSelectStackOptions {
    /**
     * The stack definition to create or select.
     */
    stack: StackDefinition;

    /**
     * The project name to use for the stack.
     */
    projectName: string;

    /**
     * The cwd to use for the stack.
     * @default process.cwd()
     */
    cwd?: string;

    /**
     * The stack settings to use for the stack.
     */
    stackSettings?: Record<string, automation.StackSettingsConfigValue>;
}

/**
 * Creates or selects a stack.
 */
export async function createOrSelectStack(options: CreateOrSelectStackOptions) {
    const cwd = options.cwd ?? process.cwd();

    const stackSettings: Record<string, automation.StackSettings> = {};
    if (options.stackSettings) {
        stackSettings[options.stack.name] = options.stackSettings;
    }

    const stack = await automation.LocalWorkspace.createOrSelectStack(
        {
            projectName: options.projectName,
            stackName: options.stack.name,
            program: options.stack.program,
        },
        {
            workDir: cwd,
            pulumiHome: cwd,
            stackSettings,
        },
    );

    return stack;
}
