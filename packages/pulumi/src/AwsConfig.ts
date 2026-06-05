import type * as aws from '@pulumi/aws';

/**
 * AWS provider options.
 */
export interface AwsConfig {
    /**
     * Default/backend region. Used as the workspace fallback region and for the state-bucket S3 client
     * (see `listRemoteStacks`); the per-stack deploy region comes from each stack's placement and
     * overrides this. Often unset outside LocalStack, where the provider resolves region from the env.
     */
    region: aws.Region;

    /**
     * Access key.
     */
    accessKey?: string;

    /**
     * Secret key.
     */
    secretKey?: string;

    /**
     * Profile name.
     */
    profile?: string;

    /**
     * Skip credentials validation.
     */
    skipCredentialsValidation?: boolean;

    /**
     * Skip requesting account ID.
     */
    skipRequestingAccountId?: boolean;

    /**
     * Use path style for S3.
     */
    s3UsePathStyle?: boolean;

    /**
     * Endoints.
     */
    endpoints?: aws.types.input.ProviderEndpoint;
}
