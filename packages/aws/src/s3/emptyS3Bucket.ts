import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

import type { Logger } from '@nzyme/logging';

/**
 *
 */
export interface EmptyS3BucketOptions {
    /**
     *
     */
    bucket: string;
    /**
     *
     */
    logger?: Logger;
}

/**
 *
 */
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
