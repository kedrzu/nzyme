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
 * Creates an ACM certificate, the DNS record that validates it, and the validation itself.
 *
 * Returns the ARN from the **validation**, not from the certificate. The two differ in when they
 * resolve, and only one of them is safe to hand to a consumer: `Certificate.arn` is available the
 * moment the certificate exists, while it is still `PENDING_VALIDATION`, so a resource built from it
 * races ACM and fails with `Certificate is not in an ISSUED state` whenever validation loses. That
 * is a race, so it passes on a slow create and fails on a fast one — observed on an API Gateway
 * domain name that deployed cleanly once and then failed on the next create of the same stack.
 * `CertificateValidation.certificateArn` carries the same value but only resolves once ACM has
 * issued, which is what orders the dependency correctly.
 */
export function createDnsValidatedCertificate(name: string, options: CreateDnsValidatedCertificateOptions) {
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
    const validationRecord = new aws.route53.Record(`${name}Validation`, {
        name: certfificateValidationOption.resourceRecordName,
        type: certfificateValidationOption.resourceRecordType,
        zoneId: options.zoneId,
        records: [certfificateValidationOption.resourceRecordValue],
        ttl: 60,
    });

    // Wait for certificate validation
    const validation = new aws.acm.CertificateValidation(
        `${name}Validation`,
        {
            certificateArn: certificate.arn,
            validationRecordFqdns: [validationRecord.fqdn],
        },
        { provider: options.provider },
    );

    return {
        /** ARN of the certificate, resolving only once ACM has issued it. */
        arn: validation.certificateArn,
        /** The certificate resource itself, for the rare caller that needs more than the ARN. */
        certificate,
    };
}
