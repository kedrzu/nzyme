import type { CloudFrontResponseHandler } from './types.js';

declare let global: typeof globalThis & {
    handler: CloudFrontResponseHandler;
};

/**
 * Defines the CloudFront function response handler.
 */
export function defineCloudFrontFunctionResponse(handler: CloudFrontResponseHandler) {
    global.handler = handler;
}
