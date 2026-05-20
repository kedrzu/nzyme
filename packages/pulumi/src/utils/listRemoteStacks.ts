import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import chalk from 'chalk';

import type { PulumiConfig } from '../PulumiConfig.js';

/**
 * Detailed information about a remote stack.
 */
export interface RemoteStackInfo {
    /**
     * Name of the stack.
     */
    name: string;

    /**
     * Last deployment timestamp.
     */
    lastDeployment?: Date;

    /**
     * Whether the stack is destroyed (has no resources).
     */
    isDestroyed?: boolean;

    /**
     * Number of resources in the stack.
     */
    resourceCount?: number;

    /**
     * Last update kind (e.g., 'update', 'destroy', 'refresh').
     */
    lastUpdateKind?: string;

    /**
     * Last update result (e.g., 'succeeded', 'failed').
     */
    lastUpdateResult?: string;

    /**
     * Version of the stack state.
     */
    version?: number;
}

/**
 * List remote stacks from the S3 backend with detailed information.
 */
export async function listRemoteStacks(config: PulumiConfig): Promise<RemoteStackInfo[]> {
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

        // List all stack state files from S3 and get their details
        const stacksInfo = await listStackStateFilesWithDetails(s3Client, bucketName, bucketPrefix);

        return stacksInfo;
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
 * Extract stack name from S3 object key.
 * @param objectKey - S3 object key (e.g., ".pulumi/stacks/project-name/stack-name.json")
 * @returns Stack name or null if not a valid stack file
 */
function extractStackNameFromKey(objectKey: string): string | null {
    const match = objectKey.match(/\.pulumi\/stacks\/[^/]+\/([^/]+)\.json$/);
    return match?.[1] || null;
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
 * List all stack state files from the S3 bucket with detailed information.
 */
async function listStackStateFilesWithDetails(
    s3Client: S3Client,
    bucketName: string,
    bucketPrefix: string,
): Promise<RemoteStackInfo[]> {
    const stacksMap = new Map<string, RemoteStackInfo>();
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
                    const stackName = extractStackNameFromKey(object.Key);
                    if (stackName) {
                        // If we haven't seen this stack yet, fetch its details
                        if (!stacksMap.has(stackName)) {
                            try {
                                const stackInfo = await fetchStackDetails(s3Client, bucketName, object.Key);
                                stacksMap.set(stackName, stackInfo);
                            } catch (error) {
                                // If we can't fetch details for a specific stack, add it with minimal info
                                console.warn(
                                    chalk.yellow(`Warning: Could not fetch details for stack ${stackName}:`),
                                    error instanceof Error ? error.message : String(error),
                                );
                                stacksMap.set(stackName, {
                                    name: stackName,
                                    lastDeployment: object.LastModified,
                                });
                            }
                        }
                    }
                }
            }
        }

        continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return Array.from(stacksMap.values());
}

/**
 * Fetch detailed information about a stack from its state file.
 */
async function fetchStackDetails(s3Client: S3Client, bucketName: string, objectKey: string): Promise<RemoteStackInfo> {
    const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
    });

    const response = await s3Client.send(getCommand);

    if (!response.Body) {
        throw new Error('Empty response body');
    }

    // Convert the response body to string
    const bodyString = await response.Body.transformToString();
    const stackState = JSON.parse(bodyString) as Record<string, unknown>;

    // Extract stack name from the object key
    const stackName = extractStackNameFromKey(objectKey) || 'unknown';

    // Parse stack state to extract relevant information
    const checkpoint = (stackState.checkpoint as Record<string, unknown>) || stackState;
    const latest = (checkpoint.latest as Record<string, unknown>) || {};
    const manifest = (latest.manifest as Record<string, unknown>) || {};
    const metadata = (latest.metadata as Record<string, unknown>) || {};

    // Extract resource count
    let resourceCount = 0;
    if (latest.resources) {
        const resources = latest.resources as unknown[];
        resourceCount = Array.isArray(resources) ? resources.length : Object.keys(resources).length;
    }

    // Extract deployment information
    const lastDeployment = manifest.time
        ? new Date(manifest.time as string)
        : latest.time
          ? new Date(latest.time as string)
          : response.LastModified || undefined;
    const isDestroyed = resourceCount === 0 || resourceCount === 1; // 1 for the stack resource itself

    // Extract update information from metadata or fallback to known values
    const lastUpdateKind = (metadata.kind as string) || (latest.kind as string) || 'update';
    const lastUpdateResult = (metadata.result as string) || (latest.result as string) || 'succeeded';
    const version = (checkpoint.version as number) || (latest.version as number) || 0;

    return {
        name: stackName,
        lastDeployment,
        isDestroyed,
        resourceCount: Math.max(0, resourceCount - 1), // Subtract 1 for the stack resource itself
        lastUpdateKind,
        lastUpdateResult,
        version,
    };
}
