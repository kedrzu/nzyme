import { ApplicationError } from '@nzyme/logging/ApplicationError.js';

/**
 * Data of a {@link TicketmasterError}. Deliberately only the request path and status: the request
 * url and the response carry the API key.
 */
export interface TicketmasterErrorData {
    /** The request path without query, e.g. `/discovery/v2/events.json`. */
    operation: string;
    /** The HTTP status; 0 when Ticketmaster could not be reached. */
    status: number;
    [key: string]: unknown;
}

/**
 * A failed Ticketmaster request. Never carries the API key, the request url, the response or its body.
 */
export class TicketmasterError extends ApplicationError {
    declare public readonly data: TicketmasterErrorData;

    /** Creates the error with a fixed message and the operation/status data. */
    constructor(message: string, data: TicketmasterErrorData) {
        super(message, data);
        this.name = 'TicketmasterError';
    }
}
