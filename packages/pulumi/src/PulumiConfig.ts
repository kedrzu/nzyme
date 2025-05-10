import type { AwsConfig } from './AwsConfig.js';

/**
 * The Pulumi config to use for the stack.
 */
export interface PulumiConfig {
    /**
     * The cwd to use for the stack.
     * @default process.cwd()
     */
    cwd?: string;

    /**
     * The project name.
     */
    project: string;

    /**
     * The AWS config to use for the stack.
     */
    awsConfig?: AwsConfig;

    /**
     * The secrets provider to use for the stack.
     */
    secretsProvider?: string;

    /**
     * The passphrase to use for the stack.
     */
    secretsPassphrase?: string;

    /**
     * The naming pattern to use for the stack.
     */
    namingPattern?: string;

    /**
     * The backend URL to use for the stack.
     */
    backendUrl?: string;
}
