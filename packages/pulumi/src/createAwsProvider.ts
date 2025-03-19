import * as aws from '@pulumi/aws';

import type { AwsConfig } from './AwsConfig.js';

/**
 * Options for the {@link createAwsProvider} function.
 */
export interface CreateAwsProviderOptions {
    /**
     * AWS region.
     */
    region: aws.Region;
    /**
     * AWS config.
     */
    config: AwsConfig;
}

/**
 * Create an AWS provider.
 */
export function createAwsProvider(name: string, options: CreateAwsProviderOptions) {
    const endpoints: aws.types.input.ProviderEndpoint[] = [];
    for (const [service, endpoint] of Object.entries(options.config.endpoints ?? {})) {
        endpoints.push({ [service]: endpoint as string });
    }

    return new aws.Provider(name, {
        ...options.config,
        region: options.region,
        endpoints,
    });
}
