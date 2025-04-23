/**
 * A message to be sent to an SQS queue.
 */
export interface QueueMessage {
    /**
     * The body of the message.
     */
    body: string;

    /**
     * The deduplication ID of the message.
     */
    deduplicationId?: string;

    /**
     * The group ID of the message.
     */
    messageGroupId?: string;

    /**
     * The delay in seconds for the message.
     */
    delaySeconds?: number;
}

/**
 * A queue that can be used to send messages to an SQS queue.
 */
export interface Queue {
    /**
     * Send a message to the queue.
     */
    send(message: QueueMessage): Promise<void>;
    /**
     * Send multiple messages to the queue.
     */
    send(messages: QueueMessage[]): Promise<void>;
}
