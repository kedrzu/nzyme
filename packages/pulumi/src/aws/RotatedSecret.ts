import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Inputs for the RotatedSecret component */
export interface RotatedSecretArgs {
    /** Stable name for the secret in Secrets Manager (e.g., "myapp/primary-secret") */
    secretName?: string;

    /** Length of the rotation window in days; one key is replaced per window (default 90) */
    rotationDays?: number;

    /**
     * How many keys the set holds (default 6). A key stays in the set for `keyCount` windows, so it
     * remains verifiable for at least `(keyCount - 1) * rotationDays` days after it stops being current.
     */
    keyCount?: number;

    /** Length of each generated key; keys contain no special characters (default 64) */
    length?: number;

    /** Optional KMS key for the secret */
    kmsKeyId?: pulumi.Input<string>;
}

/** A rotated key set: the id of the key to sign with, and every key by id. */
export interface RotatedKeySet {
    /** Id of the key to sign with now */
    current: string;

    /** Key values by key id; the ids are rotation window numbers as strings */
    keys: Record<string, string>;
}

/**
 * Maps every key slot to the rotation window whose key it holds: slot `j` holds the key of the most
 * recent window `w <= window` with `w mod keyCount == j`. A window flip therefore changes exactly one
 * slot (the oldest), and the same window always yields the same assignment, so no state is needed.
 */
export function getRotatedKeyWindows(window: number, keyCount: number): number[] {
    return Array.from({ length: keyCount }, (_, slot) => {
        const age = (((window - slot) % keyCount) + keyCount) % keyCount;
        return window - age;
    });
}

/**
 * A key set rotated by deploys: the newest key signs, older ones stay verifiable. The set is stored as
 * JSON in Secrets Manager and exposed as the secret output `keySet`.
 *
 * Each slot is a `random.RandomPassword` whose `keepers` is its window, so a deploy inside the current
 * window changes nothing and a window flip regenerates exactly one slot. Keys only rotate when a deploy
 * runs, so the retention guarantee assumes at least one deploy per window.
 */
export class RotatedSecret extends pulumi.ComponentResource {
    /** ARN of the Secrets Manager secret holding the JSON key set */
    public readonly secretArn: pulumi.Output<string>;

    /** The key set (marked secret) */
    public readonly keySet: pulumi.Output<RotatedKeySet>;

    constructor(name: string, args: RotatedSecretArgs, opts?: pulumi.ComponentResourceOptions) {
        super('nzyme:aws:RotatedSecret', name, {}, opts);

        const { secretName, rotationDays = 90, keyCount = 6, length = 64, kmsKeyId } = args;

        const window = Math.floor(Date.now() / (rotationDays * MS_PER_DAY));
        const slotWindows = getRotatedKeyWindows(window, keyCount);

        const slots = slotWindows.map(
            (slotWindow, slot) =>
                new random.RandomPassword(
                    `${name}Key${slot}`,
                    { length, special: false, keepers: { window: String(slotWindow) } },
                    { parent: this },
                ),
        );

        this.keySet = pulumi.secret(
            pulumi.all(slots.map(slot => slot.result)).apply(values => {
                const keys: Record<string, string> = {};
                for (const [slot, value] of values.entries()) {
                    keys[String(slotWindows[slot])] = value;
                }
                return { current: String(window), keys };
            }),
        );

        const secret = new aws.secretsmanager.Secret(
            `${name}Secret`,
            {
                name: secretName,
                description: `Key set rotated by Pulumi: ${keyCount} keys, one replaced every ${rotationDays} days.`,
                kmsKeyId,
            },
            { parent: this },
        );

        new aws.secretsmanager.SecretVersion(
            `${name}Version`,
            {
                secretId: secret.id,
                secretString: pulumi.secret(this.keySet.apply(keySet => JSON.stringify(keySet))),
            },
            { parent: this },
        );

        this.secretArn = secret.arn;

        this.registerOutputs({ secretArn: this.secretArn, keySet: this.keySet });
    }
}
