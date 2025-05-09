import type { CloudFrontRequestHandler } from './types.js';

declare let global: typeof globalThis & {
    handler: CloudFrontRequestHandler;
};

/**
 * Defines the CloudFront function request handler.
 * @__NO_SIDE_EFFECTS__
 */
export function defineCloudFrontFunctionRequest(handler: CloudFrontRequestHandler) {
    global.handler = handler;
}
