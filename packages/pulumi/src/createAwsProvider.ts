import * as aws from '@pulumi/aws';

import type { AwsConfig } from './AwsConfig.js';

/**
 * Create an AWS provider.
 */
export function createAwsProvider(name: string, config: AwsConfig) {
    const endpoints: aws.types.input.ProviderEndpoint[] = [];
    for (const [service, endpoint] of Object.entries(config.endpoints ?? {})) {
        endpoints.push({ [service]: endpoint as string });
    }

    return new aws.Provider(name, {
        ...config,
        endpoints,
    });
}
