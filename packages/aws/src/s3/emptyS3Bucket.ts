import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

import type { Logger } from '@nzyme/logging/Logger.js';

/** Options for emptying an S3 bucket. */
export interface EmptyS3BucketOptions {
    /** Name of the S3 bucket to empty. */
    bucket: string;
    /** Optional logger for reporting progress. */
    logger?: Logger;
}

/** Deletes all objects from an S3 bucket. */
export async function emptyS3Bucket(options: EmptyS3BucketOptions) {
    const s3Client = new S3Client({});
    const logger = options.logger;

    // List all objects in the bucket
    const listResponse = await s3Client.send(
        new ListObjectsV2Command({
            Bucket: options.bucket,
        }),
    );

    if (listResponse.Contents && listResponse.Contents.length > 0) {
        // Delete all objects in the bucket
        await s3Client.send(
            new DeleteObjectsCommand({
                Bucket: options.bucket,
                Delete: {
                    Objects: listResponse.Contents.map(obj => ({ Key: obj.Key as string })),
                },
            }),
        );
    }

    logger?.info(`Successfully emptied bucket ${options.bucket} - ${listResponse.Contents?.length} objects deleted.`);
}
