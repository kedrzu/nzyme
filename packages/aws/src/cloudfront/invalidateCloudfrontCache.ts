import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';

type InvalidateCloudfrontCacheOptions = {
    distributionId: string;
    /** If not set will all cached items. */
    paths?: string[];
};

/**
 * Invalidates a CloudFront distribution cache.
 */
export async function invalidateCloudfrontCache(options: InvalidateCloudfrontCacheOptions) {
    const cloudfrontClient = new CloudFrontClient();

    const paths = options.paths ?? ['/*'];

    const invalidation = await cloudfrontClient.send(
        new CreateInvalidationCommand({
            DistributionId: options.distributionId,
            InvalidationBatch: {
                CallerReference: Date.now().toString(),
                Paths: {
                    Quantity: paths.length,
                    Items: paths,
                },
            },
        }),
    );

    return invalidation;
}
