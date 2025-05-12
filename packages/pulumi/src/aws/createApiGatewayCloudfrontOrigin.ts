import * as pulumi from '@pulumi/pulumi';

import type { CloudfrontOriginProps } from './types.js';

/**
 * The options for creating a Cloudfront origin for an API Gateway.
 */
export interface ApiGatewayCloudfrontOriginOptions {
    /**
     * The ID of the origin.
     */
    originId: pulumi.Input<string>;
    /**
     * The API Gateway URL.
     */
    apiUrl: pulumi.Input<string>;
    /**
     * Optional element that causes CloudFront to request your content from a directory in your Amazon S3 bucket or your custom origin.
     */
    originPath?: pulumi.Input<string>;
}

/**
 * Creates a Cloudfront origin for an API Gateway.
 */
export function createApiGatewayCloudfrontOrigin(options: ApiGatewayCloudfrontOriginOptions): CloudfrontOriginProps {
    const apiUrl = pulumi.interpolate`${options.apiUrl}`.apply(url => new URL(url));

    return {
        domainName: apiUrl.apply(url => url.hostname),
        originId: options.originId,
        originPath: options.originPath,
        customOriginConfig: {
            httpPort: 80,
            httpsPort: 443,
            originProtocolPolicy: 'https-only',
            originSslProtocols: ['TLSv1.2'],
        },
    };
}
