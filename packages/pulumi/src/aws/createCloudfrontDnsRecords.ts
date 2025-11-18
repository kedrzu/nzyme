import * as aws from '@pulumi/aws';
import type * as pulumi from '@pulumi/pulumi';

/**
 * Options for creating CloudFront DNS records
 */
export interface CreateCloudfrontDnsRecordsOptions {
    /**
     * The domain name for the DNS records
     */
    domainName: pulumi.Input<string>;
    /**
     * The Route53 zone ID
     */
    zoneId: pulumi.Input<string>;
    /**
     * The CloudFront distribution
     */
    distribution: aws.cloudfront.Distribution;
}

/**
 * Creates Route53 A and AAAA records for a CloudFront distribution.
 */
export function createCloudfrontDnsRecords(name: string, options: CreateCloudfrontDnsRecordsOptions) {
    new aws.route53.Record(`${name}A`, {
        name: options.domainName,
        zoneId: options.zoneId,
        type: 'A',
        aliases: [
            {
                name: options.distribution.domainName,
                zoneId: options.distribution.hostedZoneId,
                evaluateTargetHealth: false,
            },
        ],
    });

    new aws.route53.Record(`${name}AAAA`, {
        name: options.domainName,
        zoneId: options.zoneId,
        type: 'AAAA',
        aliases: [
            {
                name: options.distribution.domainName,
                zoneId: options.distribution.hostedZoneId,
                evaluateTargetHealth: false,
            },
        ],
    });
}
