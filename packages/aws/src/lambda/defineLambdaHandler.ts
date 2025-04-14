import type { Handler } from 'aws-lambda';

/**
 * Defines a lambda handler for a given event and result type.
 * @param handlerFactory - The factory function that creates the handler.
 * @returns A promise that resolves to the handler.
 */
// #__NO_SIDE_EFFECTS__
export function defineLambdaHandler<THandler extends Handler>(handler: THandler) {
    return handler;
}
