import { automation } from '@pulumi/pulumi';

import type { AwsConfig } from './AwsConfig.js';
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
     * The project description to use for the stack.
     */
    projectDescription?: string;

    /**
     * The cwd to use for the stack.
     * @default process.cwd()
     */
    cwd?: string;

    /**
     * The AWS config to use for the stack.
     */
    awsConfig: AwsConfig;
}

/**
 * Creates or selects a stack.
 */
export async function createOrSelectStack(options: CreateOrSelectStackOptions) {
    const cwd = options.cwd ?? process.cwd();

    const stackSettings: Record<string, automation.StackSettingsConfigValue> = {};

    for (const [key, value] of Object.entries(options.awsConfig)) {
        if (typeof value === 'string') {
            stackSettings[`aws:${key}`] = value;
        } else if (typeof value === 'boolean') {
            stackSettings[`aws:${key}`] = value.toString();
        }
    }

    if (options.awsConfig.endpoints) {
        const endpoints: Record<string, string>[] = [];
        for (const [service, endpoint] of Object.entries(options.awsConfig.endpoints)) {
            endpoints.push({ [service]: endpoint as string });
        }

        stackSettings['aws:endpoints'] = endpoints;
    }

    const stack = await automation.LocalWorkspace.createOrSelectStack(
        {
            projectName: options.projectName,
            stackName: options.stack.name,
            program: options.stack.program,
        },
        {
            workDir: cwd,
            stackSettings: {
                [options.stack.name]: {
                    config: stackSettings,
                },
            },
            projectSettings: {
                name: options.projectName,
                description: options.projectDescription,
                runtime: 'nodejs',
            },
        },
    );

    return stack;
}
