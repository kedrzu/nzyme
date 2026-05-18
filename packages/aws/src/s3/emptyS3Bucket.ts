import {
    DeleteObjectsCommand,
    type DeleteObjectsCommandOutput,
    ListObjectsV2Command,
    ListObjectVersionsCommand,
    S3Client,
} from '@aws-sdk/client-s3';

import type { Logger } from '@nzyme/logging/Logger.js';

/** Options for emptying an S3 bucket. */
export interface EmptyS3BucketOptions {
    /** Name of the S3 bucket to empty. */
    bucket: string;
    /** Optional logger for reporting progress. */
    logger?: Logger;
    /** If true, deletes all object versions and delete markers (required for versioned buckets). */
    versioned?: boolean;
}

/** Deletes all objects from an S3 bucket. */
export async function emptyS3Bucket(options: EmptyS3BucketOptions) {
    const s3Client = new S3Client({});
    const logger = options.logger;
    const bucket = options.bucket;

    const deleted = options.versioned
        ? await deleteAllVersions(s3Client, bucket)
        : await deleteAllObjects(s3Client, bucket);

    logger?.info(`Successfully emptied bucket ${bucket} - ${deleted} objects deleted.`);
}

async function deleteAllObjects(s3Client: S3Client, bucket: string) {
    let deleted = 0;
    let continuationToken: string | undefined;

    do {
        const listResponse = await s3Client.send(
            new ListObjectsV2Command({
                Bucket: bucket,
                ContinuationToken: continuationToken,
            }),
        );

        const objects = listResponse.Contents;
        if (objects && objects.length > 0) {
            const deleteResponse = await s3Client.send(
                new DeleteObjectsCommand({
                    Bucket: bucket,
                    Delete: {
                        Objects: objects.map(obj => ({ Key: obj.Key as string })),
                    },
                }),
            );
            throwIfDeleteErrors(bucket, deleteResponse.Errors);
            deleted += objects.length;
        }

        continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
    } while (continuationToken);

    return deleted;
}

async function deleteAllVersions(s3Client: S3Client, bucket: string) {
    let deleted = 0;
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;

    do {
        const listResponse = await s3Client.send(
            new ListObjectVersionsCommand({
                Bucket: bucket,
                KeyMarker: keyMarker,
                VersionIdMarker: versionIdMarker,
            }),
        );

        const entries = [...(listResponse.Versions ?? []), ...(listResponse.DeleteMarkers ?? [])];

        if (entries.length > 0) {
            const deleteResponse = await s3Client.send(
                new DeleteObjectsCommand({
                    Bucket: bucket,
                    Delete: {
                        Objects: entries.map(entry => ({
                            Key: entry.Key as string,
                            VersionId: entry.VersionId as string,
                        })),
                    },
                }),
            );
            throwIfDeleteErrors(bucket, deleteResponse.Errors);
            deleted += entries.length;
        }

        if (listResponse.IsTruncated) {
            keyMarker = listResponse.NextKeyMarker;
            versionIdMarker = listResponse.NextVersionIdMarker;
        } else {
            keyMarker = undefined;
            versionIdMarker = undefined;
        }
    } while (keyMarker || versionIdMarker);

    return deleted;
}

function throwIfDeleteErrors(bucket: string, errors: DeleteObjectsCommandOutput['Errors']) {
    if (!errors || errors.length === 0) {
        return;
    }

    const summary = errors
        .map(err => `${err.Key}${err.VersionId ? `@${err.VersionId}` : ''}: ${err.Code} ${err.Message}`)
        .join('; ');

    throw new Error(`Failed to delete ${errors.length} object(s) from bucket ${bucket}: ${summary}`);
}
