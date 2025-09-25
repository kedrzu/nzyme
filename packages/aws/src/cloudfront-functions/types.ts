/**
 * Represents CloudFront HTTP headers as a dictionary of single or multiple values
 */
export type CloudFrontHeaders = MultiValueDictionary<SingleValue>;

/**
 * Represents CloudFront cookies as a dictionary of single or multiple cookie values with optional attributes
 */
export type CloudFrontCookies = MultiValueDictionary<Cookie>;

/**
 * Represents CloudFront query parameters as a dictionary of single or multiple values
 */
export type CloudFrontQuery = MultiValueDictionary<SingleValue>;

/**
 * Represents a CloudFront request object
 */
export interface CloudFrontRequest {
    /** HTTP method of the request (GET, POST, etc.) */
    method: string;
    /** Request URI path */
    uri: string;
    /** Optional query string parameters */
    querystring?: CloudFrontQuery;
    /** HTTP headers included in the request */
    headers: CloudFrontHeaders;
    /** Optional cookies included in the request */
    cookies?: CloudFrontCookies;
}

/**
 * Represents a CloudFront response object
 */
export interface CloudFrontResponse {
    /** HTTP status code of the response */
    statusCode: number;
    /** Optional status description */
    statusDescription?: string;
    /** HTTP headers to be included in the response */
    headers: CloudFrontHeaders;
    /** Optional cookies to be included in the response */
    cookies?: CloudFrontCookies;
}

/**
 * Represents a CloudFront viewer request event
 */
export interface CloudFrontRequestEvent {
    /** Version of the CloudFront function event format */
    version: string;
    /** Context information about the event */
    context: {
        /** Type of the event, always 'viewer-request' for request events */
        eventType: 'viewer-request';
    };
    /** Information about the viewer making the request */
    viewer: {
        /** IP address of the viewer */
        ip: string;
    };
    /** The actual request object */
    request: CloudFrontRequest;
}

/**
 * Represents a CloudFront viewer response event
 */
export interface CloudFrontResponseEvent {
    /** Version of the CloudFront function event format */
    version: string;
    /** Context information about the event */
    context: {
        /** Type of the event, always 'viewer-response' for response events */
        eventType: 'viewer-response';
    };
    /** Information about the viewer making the request */
    viewer: {
        /** IP address of the viewer */
        ip: string;
    };
    /** The response object being sent to the viewer */
    response: CloudFrontResponse;
    /** The original request object */
    request: CloudFrontRequest;
}

/**
 * Function type for handling CloudFront viewer requests
 * @param event The CloudFront request event
 * @returns Either a modified request or a response to short-circuit the request
 */
export interface CloudFrontRequestHandler {
    (event: CloudFrontRequestEvent): CloudFrontRequest | CloudFrontResponse;
}

/**
 * Function type for handling CloudFront viewer responses
 * @param event The CloudFront response event
 * @returns The modified response
 */
export interface CloudFrontResponseHandler {
    (event: CloudFrontResponseEvent): CloudFrontResponse;
}

/**
 * Represents a single value
 */
export interface SingleValue {
    /**
     * The value of the single value
     */
    value: string;
}

/**
 * Represents a cookie
 */
export interface Cookie extends SingleValue {
    /**
     * The attributes of the cookie
     */
    attributes?: string;
}

/**
 * Represents a multivalue
 */
export interface MultiValue<T> {
    /**
     * The multivalue of the multivalue
     */
    multivalue?: T[];
}

/**
 * Represents a multivalue dictionary
 */
export type MultiValueDictionary<T> = Record<string, (MultiValue<T> & T) | undefined>;
