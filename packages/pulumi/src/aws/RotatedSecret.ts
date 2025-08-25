import { createHash } from 'crypto';

import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';

/** Inputs for the RotatedSecret component */
export interface RotatedSecretArgs {
    /** Stable name for the secret in Secrets Manager (e.g., "myapp/primary-secret") */
    secretName?: string;

    /** Length of generated secret (default 48) */
    secretLength?: number;

    /** Rotate on the first pulumi up after this many days have elapsed (default 30) */
    expiryDays?: number;

    /** How many most-recent secrets to keep in the JSON payload (default 2: current + previous) */
    historySize?: number;

    /** Character set options */
    minLower?: number;
    /**
     * Minimum number of uppercase characters
     */
    minUpper?: number;
    /**
     * Minimum number of numeric characters
     */
    minNumeric?: number;
    /**
     * Minimum number of special characters
     */
    minSpecial?: number;
    /**
     * Override the special characters
     */
    overrideSpecial?: string;

    /** Optional KMS key for the secret */
    kmsKeyId?: pulumi.Input<string>;
}

/**
 * The secret payload stored in Secrets Manager is a JSON object like:
 * {
 *   "versions": [
 *     { "id": 5, "value": "...." },       // index 0 is AWSCURRENT
 *     { "id": 4, "value": "...." },       // previous
 *     ...
 *   ]
 * }
 */
export class RotatedSecret extends pulumi.ComponentResource {
    /** ARN of the Secrets Manager secret */
    public readonly secretArn: pulumi.Output<string>;

    /** ID of the current SecretVersion resource */
    public readonly currentVersionId: pulumi.Output<string>;

    /** Convenience: current secret value (marked secret) */
    public readonly currentSecret: pulumi.Output<string>;

    /** History secret values (marked secret) */
    public readonly history: pulumi.Output<Record<string, string>>;

    /**
     *
     */
    constructor(name: string, args: RotatedSecretArgs, opts?: pulumi.ComponentResourceOptions) {
        super('examples:secrets:RotatedSecret', name, {}, opts);

        const {
            secretName,
            secretLength = 48,
            expiryDays = 30,
            historySize = 2,
            minLower = 1,
            minUpper = 1,
            minNumeric = 1,
            minSpecial = 1,
            overrideSpecial = '_-!@#$%^&*()[]{}',
            kmsKeyId,
        } = args;

        // Stable secret container
        const secret = new aws.secretsmanager.Secret(
            `${name}Secret`,
            {
                name: secretName,
                description: `Rotated by Pulumi (no rotation Lambda). Keeps last ${historySize} versions in JSON payload.`,
                kmsKeyId,
            },
            { parent: this },
        );

        // Compute a "time window id" that flips every expiryDays since anchor.
        const periodMs = expiryDays * 24 * 60 * 60 * 1000;
        const windowId = Math.floor(Date.now() / periodMs).toString();

        const generated = new random.RandomPassword(
            `${name}Value`,
            {
                length: secretLength,
                minLower,
                minUpper,
                minNumeric,
                minSpecial,
                overrideSpecial,
                keepers: { windowId },
            },
            { parent: this },
        );

        // Create a new SecretVersion (this becomes AWSCURRENT)
        const version = new aws.secretsmanager.SecretVersion(
            `${name}Version`,
            {
                secretId: secret.id,
                secretString: generated.result,
                // versionStages defaults to ["AWSCURRENT"]
            },
            { parent: this },
        );

        const history = pulumi.all([secret.id, version.secretString]).apply(async ([secretId, secretString]) => {
            const versionsOutput = await aws.secretsmanager.getSecretVersions({ secretId }, { parent: this });
            const versions = versionsOutput.versions.sort(
                (a, b) => new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime(),
            );

            const secrets = await Promise.all(
                versions.slice(0, historySize).map(async version => {
                    const result = await aws.secretsmanager.getSecretVersion(
                        {
                            secretId,
                            versionId: version.versionId,
                        },
                        { parent: this },
                    );

                    return result.secretString;
                }),
            );

            if (!secrets.find(v => v === secretString) && secretString) {
                secrets.unshift(secretString);
            }

            // Map to object with 8-char MD5 hash keys
            const historyMap: Record<string, string> = {};
            for (const secret of secrets) {
                const hash = createHash('md5').update(secret).digest('hex').substring(0, 8);
                historyMap[hash] = secret;
            }

            return historyMap;
        });

        // Mark sensitive outputs as Pulumi secrets
        this.currentSecret = pulumi.secret(generated.result);
        this.history = pulumi.secret(history);
        this.currentVersionId = version.versionId;
        this.secretArn = secret.arn;

        this.registerOutputs({
            secretArn: this.secretArn,
            currentVersionId: this.currentVersionId,
        });
    }
}
