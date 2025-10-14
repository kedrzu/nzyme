import * as pulumi from '@pulumi/pulumi';

import type { CloudfrontOriginProps } from './types.js';

/**
 * The options for creating a Cloudfront origin for an API Gateway.
 */
export interface ApiGatewayCloudfrontOriginOptions {
    /**
     * The ID of the origin.
     */
    originId: string;
    /**
     * The API Gateway URL.
     */
    apiUrl: pulumi.Input<string>;
}

/**
 * Creates a Cloudfront origin for an API Gateway.
 */
export function createApiGatewayCloudfrontOrigin(options: ApiGatewayCloudfrontOriginOptions) {
    const apiUrl = pulumi.interpolate`${options.apiUrl}`.apply(url => new URL(url));
    const origin: CloudfrontOriginProps = {
        originId: options.originId,
        domainName: apiUrl.apply(url => url.hostname),
        originPath: apiUrl.apply(url => url.pathname),
        customOriginConfig: {
            httpPort: 80,
            httpsPort: 443,
            originProtocolPolicy: 'https-only',
            originSslProtocols: ['TLSv1.2'],
        },
    };

    return origin;
}
