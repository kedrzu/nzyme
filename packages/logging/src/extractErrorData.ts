import { ApplicationError } from './ApplicationError.js';

/**
 * Extracts data from an error object.
 * @param error - The error object.
 * @returns The data from the error object.
 * @__NO_SIDE_EFFECTS__
 */
export function extractErrorData(error: unknown) {
    if (error instanceof ApplicationError) {
        const { logger, ...data } = error.data;
        data.logger = logger?.name;

        return data;
    }
}
