import type { automation } from '@pulumi/pulumi';

import type { AwsConfig } from '../AwsConfig.js';

/**
 * Options for {@link buildAwsStackConfig}.
 */
export interface BuildAwsStackConfigOptions {
    /**
     * Workspace-level AWS config (credentials, endpoints, default region). Optional — outside
     * LocalStack it is usually unset and the provider resolves credentials/region from the env.
     */
    awsConfig?: AwsConfig;

    /**
     * Per-stack region from the stack's `region` option. When set it overrides {@link AwsConfig.region},
     * so each generated stack deploys to its own region's default provider even though every stack in
     * a CLI run shares the same `awsConfig` and the same ambient `AWS_REGION`.
     */
    region?: string;
}

/**
 * Builds the `aws:*` Pulumi stack-config entries for a single stack from the shared AWS config plus
 * the per-stack region. The per-stack region is authoritative: `@pulumi/aws` resolves the provider
 * region as `config "region" ?? AWS_REGION`, so writing `aws:region` here directs each stack to its
 * own region regardless of the ambient `AWS_REGION` env var.
 * @__NO_SIDE_EFFECTS__
 */
export function buildAwsStackConfig(
    options: BuildAwsStackConfigOptions,
): Record<string, automation.StackSettingsConfigValue> {
    const stackConfig: Record<string, automation.StackSettingsConfigValue> = {};
    const awsConfig = options.awsConfig;

    if (awsConfig) {
        for (const [key, value] of Object.entries(awsConfig)) {
            if (typeof value === 'string') {
                stackConfig[`aws:${key}`] = value;
            } else if (typeof value === 'boolean') {
                stackConfig[`aws:${key}`] = value.toString();
            }
        }

        if (awsConfig.endpoints) {
            const endpoints: Record<string, string>[] = [];
            for (const [service, endpoint] of Object.entries(awsConfig.endpoints)) {
                endpoints.push({ [service]: endpoint as string });
            }

            stackConfig['aws:endpoints'] = endpoints;
        }
    }

    // Per-stack region wins over the shared default region.
    if (options.region) {
        stackConfig['aws:region'] = options.region;
    }

    return stackConfig;
}
