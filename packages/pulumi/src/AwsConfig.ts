import type * as aws from '@pulumi/aws';

/**
 * AWS provider options.
 */
export interface AwsConfig {
    /**
     * Region.
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
