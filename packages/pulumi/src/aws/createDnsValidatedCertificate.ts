import * as aws from '@pulumi/aws';
import type * as pulumi from '@pulumi/pulumi';

/**
 * Options for creating a DNS validated certificate.
 */
export interface CreateDnsValidatedCertificateOptions {
    /**
     * The primary domain to create the certificate for.
     *
     * A plain string rather than an input: the names decide how many validation records exist, and a
     * name that only resolves while the update runs cannot be counted before it.
     */
    domainName: string;
    /**
     * Further names the certificate must cover, such as `*.example.com` next to `example.com`.
     *
     * A wildcard is validated against its parent domain, so names that reduce to the same validation
     * domain share one record instead of getting one each — which is also what keeps Route53 from
     * being asked for two records with the same name.
     */
    subjectAlternativeNames?: string[];
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
 * Creates an ACM certificate, the DNS records that validate it, and the validation itself.
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
    const subjectAlternativeNames = options.subjectAlternativeNames ?? [];

    const certificate = new aws.acm.Certificate(
        name,
        {
            domainName: options.domainName,
            subjectAlternativeNames: subjectAlternativeNames.length > 0 ? subjectAlternativeNames : undefined,
            validationMethod: 'DNS',
        },
        { provider: options.provider },
    );

    // Create one DNS validation record per distinct validation domain.
    const validationRecords = getValidationDomains(options.domainName, subjectAlternativeNames).map(
        (validationDomain, index) => {
            const validationOption = certificate.domainValidationOptions.apply(validationOptions => {
                const match = validationOptions.find(
                    option => reduceValidationDomain(option.domainName) === validationDomain,
                );
                if (!match) {
                    throw new Error(
                        `ACM returned no validation option for ${validationDomain} on certificate ${name}.`,
                    );
                }

                return match;
            });

            return new aws.route53.Record(
                index === 0 ? `${name}-validation` : `${name}-validation-${index}`,
                {
                    name: validationOption.resourceRecordName,
                    type: validationOption.resourceRecordType,
                    zoneId: options.zoneId,
                    records: [validationOption.resourceRecordValue],
                    ttl: 60,
                },
                // The first record used to be called `${name}Validation`. Renaming a Pulumi resource
                // is a create followed by a delete, and Route53 refuses to create a record that
                // already exists — so the rename is declared as an alias, which remaps the URN
                // instead of touching DNS. Droppable once every stack has deployed past it.
                index === 0 ? { aliases: [{ name: `${name}Validation` }] } : undefined,
            );
        },
    );

    // Wait for certificate validation
    const validation = new aws.acm.CertificateValidation(
        `${name}-validation`,
        {
            certificateArn: certificate.arn,
            validationRecordFqdns: validationRecords.map(record => record.fqdn),
        },
        { provider: options.provider, aliases: [{ name: `${name}Validation` }] },
    );

    return {
        /** ARN of the certificate, resolving only once ACM has issued it. */
        arn: validation.certificateArn,
        /** The certificate resource itself, for the rare caller that needs more than the ARN. */
        certificate,
    };
}

/**
 * The distinct domains ACM will ask for a record for, in the order the names were given.
 *
 * A wildcard is validated against its parent, so `*.example.com` reduces to `example.com`: a
 * certificate covering both needs one record, and asking Route53 for two records with the same name
 * would fail. This reduced name is also the lookup key used to match a validation option returned by
 * ACM back to the domain it was ordered for — see `reduceValidationDomain`.
 */
function getValidationDomains(domainName: string, subjectAlternativeNames: string[]) {
    const validationDomains: string[] = [];

    for (const name of [domainName, ...subjectAlternativeNames]) {
        const validationDomain = reduceValidationDomain(name);

        if (!validationDomains.includes(validationDomain)) {
            validationDomains.push(validationDomain);
        }
    }

    return validationDomains;
}

/**
 * Reduces a domain name to the form ACM validates it against: a wildcard is validated against its
 * parent, so `*.example.com` reduces to `example.com`.
 *
 * ACM echoes back `domainValidationOptions[].domainName` verbatim as the name was ordered — a
 * wildcard SAN stays a wildcard — so matching a validation option to an entry from
 * `getValidationDomains` requires reducing the option's own name the same way before comparing;
 * comparing it unreduced only matches when the wildcard's parent also happens to be an ordered name.
 */
function reduceValidationDomain(domainName: string) {
    return domainName.startsWith('*.') ? domainName.slice(2) : domainName;
}
