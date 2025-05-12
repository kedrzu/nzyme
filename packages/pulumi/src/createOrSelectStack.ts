import path from 'path';

import { automation } from '@pulumi/pulumi';

import type { Stack, StackOutput } from './defineStack.js';
import type { PulumiConfig } from './PulumiConfig.js';

/**
 * Creates or selects a stack.
 */
export async function createOrSelectStack<TOutput extends StackOutput>(stack: Stack<TOutput>, config: PulumiConfig) {
    const cwd = config.cwd ?? process.cwd();
    const envVars = { ...process.env } as Record<string, string>;
    const stackConfig: Record<string, automation.StackSettingsConfigValue> = {};

    if (config.awsConfig) {
        for (const [key, value] of Object.entries(config.awsConfig)) {
            if (typeof value === 'string') {
                stackConfig[`aws:${key}`] = value;
            } else if (typeof value === 'boolean') {
                stackConfig[`aws:${key}`] = value.toString();
            }
        }

        if (config.awsConfig?.endpoints) {
            const endpoints: Record<string, string>[] = [];
            for (const [service, endpoint] of Object.entries(config.awsConfig.endpoints)) {
                endpoints.push({ [service]: endpoint as string });
            }

            stackConfig['aws:endpoints'] = endpoints;
        }
    }

    if (config.namingPattern) {
        stackConfig['pulumi:autonaming'] = { pattern: config.namingPattern };
    }

    if (config.backendUrl) {
        envVars.PULUMI_BACKEND_URL = config.backendUrl;
    }

    if (config.secretsPassphrase) {
        envVars.PULUMI_PASSPHRASE = config.secretsPassphrase;
    }

    return await automation.LocalWorkspace.createOrSelectStack(
        {
            projectName: config.project,
            stackName: stack.name,
            program: stack.resources,
        },
        {
            envVars,
            workDir: cwd,
            pulumiHome: path.join(cwd, '.pulumi'),
            stackSettings: {
                [stack.name]: {
                    secretsProvider: config.secretsProvider,
                    config: stackConfig,
                },
            },
            secretsProvider: config.secretsProvider,
            projectSettings: {
                name: config.project,
                runtime: 'nodejs',
            },
        },
    );
}
