import * as aws from '@pulumi/aws';
import type * as pulumi from '@pulumi/pulumi';

/**
 * Options for creating a DNS validated certificate.
 */
export interface CreateDnsValidatedCertificateOptions {
    /**
     * The domain name to create the certificate for.
     */
    domainName: pulumi.Input<string>;
    /**
     * The zone ID to create the validation records in.
     */
    zoneId: pulumi.Input<string>;
    /**
     * The provider to use for the certificate.
     */
    provider?: aws.Provider;
}

/**
 * Creates a DNS validated certificate.
 */
export function createDnsValidatedCertificate(
    name: string,
    options: CreateDnsValidatedCertificateOptions,
) {
    const certificate = new aws.acm.Certificate(
        name,
        {
            domainName: options.domainName,
            validationMethod: 'DNS',
        },
        { provider: options.provider },
    );

    const certfificateValidationOption = certificate.domainValidationOptions[0]!;

    // Create DNS validation records
    const validationRecord = new aws.route53.Record(`${name}-validation`, {
        name: certfificateValidationOption.resourceRecordName,
        type: certfificateValidationOption.resourceRecordType,
        zoneId: options.zoneId,
        records: [certfificateValidationOption.resourceRecordValue],
        ttl: 60,
    });

    // Wait for certificate validation
    new aws.acm.CertificateValidation(
        `${name}-validation`,
        {
            certificateArn: certificate.arn,
            validationRecordFqdns: [validationRecord.fqdn],
        },
        { provider: options.provider },
    );

    return certificate;
}
