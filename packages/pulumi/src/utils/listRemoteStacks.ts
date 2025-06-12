import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import chalk from 'chalk';

import type { PulumiConfig } from '../PulumiConfig.js';

/**
 * List remote stacks from the S3 backend.
 */
export async function listRemoteStacks(config: PulumiConfig): Promise<string[]> {
    try {
        // Check if backend is S3
        if (!config.backendUrl?.startsWith('s3://')) {
            return [];
        }

        // Parse S3 URL to get bucket name and prefix
        const s3Url = new URL(config.backendUrl);
        const bucketName = s3Url.hostname;
        const bucketPrefix = s3Url.pathname.slice(1); // Remove leading slash

        // Create S3 client with proper credential handling
        const s3Client = createS3Client(config);

        // List all stack state files from S3
        const stackNames = await listStackStateFiles(s3Client, bucketName, bucketPrefix);

        return stackNames;
    } catch (error) {
        // If we can't list remote stacks (e.g., no S3 access), return empty array
        console.warn(
            chalk.yellow('Warning: Could not list remote stacks from S3 backend:'),
            error instanceof Error ? error.message : String(error),
        );
        return [];
    }
}

/**
 * Create S3 client with proper AWS credential handling.
 */
function createS3Client(config: PulumiConfig): S3Client {
    const { awsConfig } = config;

    // If explicit credentials are provided, use them
    if (awsConfig?.accessKey && awsConfig?.secretKey) {
        return new S3Client({
            region: awsConfig.region,
            credentials: {
                accessKeyId: awsConfig.accessKey,
                secretAccessKey: awsConfig.secretKey,
            },
        });
    }

    // Otherwise, use default credential provider (supports profiles, environment variables, etc.)
    const credentialsProvider = defaultProvider({
        profile: awsConfig?.profile,
    });

    return new S3Client({
        region: awsConfig?.region,
        credentials: credentialsProvider,
    });
}

/**
 * List all stack state files from the S3 bucket.
 */
async function listStackStateFiles(s3Client: S3Client, bucketName: string, bucketPrefix: string): Promise<string[]> {
    const stacks = new Set<string>();
    let continuationToken: string | undefined;

    const prefix = bucketPrefix ? `${bucketPrefix}/.pulumi/stacks/` : '.pulumi/stacks/';

    do {
        const listCommand = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        });

        const response = await s3Client.send(listCommand);

        if (response.Contents) {
            for (const object of response.Contents) {
                if (object.Key) {
                    // Extract stack name from path like: .pulumi/stacks/project-name/stack-name.json
                    const match = object.Key.match(/\.pulumi\/stacks\/[^/]+\/([^/]+)\.json$/);
                    if (match && match[1]) {
                        stacks.add(match[1]);
                    }
                }
            }
        }

        continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return Array.from(stacks);
}
