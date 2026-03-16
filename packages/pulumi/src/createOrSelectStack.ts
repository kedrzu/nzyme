import path from 'path';
import { fileURLToPath } from 'url';

import { automation, runtime } from '@pulumi/pulumi';

import { waitFor } from '@nzyme/utils/waitFor.js';

import type { Stack, StackOutput } from './defineStack.js';
import type { PulumiConfig } from './PulumiConfig.js';

/**
 * Creates or selects a stack.
 */
export async function createOrSelectStack<TOutput extends StackOutput>(stack: Stack<TOutput>, config: PulumiConfig) {
    const cwd = config.cwd ?? process.cwd();
    const envVars = { ...process.env } as Record<string, string>;

    // Resolve the node_modules directory containing @pulumi/pulumi.
    // Bun's node_modules layout is not compatible with Node.js module resolution
    // used by Pulumi's dynamic provider subprocess.
    const pulumiPkgPath = path.dirname(fileURLToPath(import.meta.resolve('@pulumi/pulumi/package.json')));
    const nodeModulesDir = path.resolve(pulumiPkgPath, '..', '..');
    envVars.NODE_PATH = envVars.NODE_PATH ? `${nodeModulesDir}:${envVars.NODE_PATH}` : nodeModulesDir;

    const stackConfig: Record<string, automation.StackSettingsConfigValue> = {};
    const pulumiHome = config.pulumiHome ?? path.join(cwd, '.pulumi');

    const pulumiCommand = await automation.PulumiCommand.install({
        root: pulumiHome,
    });

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
        envVars.PULUMI_CONFIG_PASSPHRASE = config.secretsPassphrase;
    }

    return await automation.LocalWorkspace.createOrSelectStack(
        {
            projectName: config.project,
            stackName: stack.name,
            program: async () => {
                if (config.resourceTransformation) {
                    runtime.registerStackTransformation(config.resourceTransformation);
                }

                const resources = stack.resources();

                await waitFor(50);

                return resources;
            },
        },
        {
            envVars,
            workDir: cwd,
            pulumiHome,
            pulumiCommand,
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
