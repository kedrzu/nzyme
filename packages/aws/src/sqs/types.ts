/**
 * A message to be sent to an SQS queue.
 */
export interface QueueMessage<T> {
    /**
     * The body of the message.
     * Will be serialized to JSON.
     */
    body: T;
    /**
     * The deduplication ID of the message.
     */
    deduplicationId?: string;
    /**
     * The group ID of the message.
     */
    messageGroupId?: string;
}

/**
 * A queue that can be used to send messages to an SQS queue.
 */
export interface Queue<T> {
    /**
     * Send a message to the queue.
     */
    send(message: QueueMessage<T>): Promise<void>;
    /**
     * Send multiple messages to the queue.
     */
    send(messages: QueueMessage<T>[]): Promise<void>;
}
