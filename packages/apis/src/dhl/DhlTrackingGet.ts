import { defineEndpoint } from '@nzyme/fetch-utils/defineEndpoint.js';
import { jsonResponse } from '@nzyme/fetch-utils/jsonResponse.js';
import type { DateTimeISO } from '@nzyme/types/Date.js';

/** High-level shipment tracking status used by the DHL Tracking API. */
export type DhlTrackingStatus = 'delivered' | 'failure' | 'pre-transit' | 'transit' | 'unknown';

/** Physical or service-point location associated with a tracking event. */
export type DhlTrackingLocation = {
    /** Street address of the location. */
    address?: {
        /** City or locality name. */
        addressLocality?: string;
        /** Servicing locality when it differs from the destination locality. */
        addressLocalityServicing?: string;
        /** State or region name. */
        addressRegion?: string;
        /** ISO 3166-1 alpha-2 country code. */
        countryCode?: string;
        /** Postal code. */
        postalCode?: string;
        /** Full street address line. */
        streetAddress?: string;
    };
    /** DHL service point where the shipment can be collected. */
    servicePoint?: {
        /** URL with details about the service point. */
        url: string;
        /** Human-readable label for the service point. */
        label: string;
    };
};

/** Single tracking event in a shipment's journey. */
export type DhlTrackingEvent = {
    /** ISO 8601 timestamp of when the event occurred. */
    timestamp: DateTimeISO;
    /** Location where the event took place. */
    location: DhlTrackingLocation;
    /** Machine-readable status code for this event. */
    statusCode: DhlTrackingStatus;
    /** Short human-readable status label. */
    status: string;
    /** Detailed description of the tracking event. */
    description: string;
    /** Optional remark providing additional context. */
    remark?: string;
    /** Suggested next steps for the recipient, if any. */
    nextSteps?: string;
};

/** Root response object returned by the DHL Shipment Tracking API. */
export type DhlTrackingInfo = {
    /** List of shipments matching the tracking query. */
    shipments: {
        /** Shipment tracking identifier. */
        id: string;
        /** DHL service product name (e.g. "express", "parcel"). */
        service: string;
        /** Origin location of the shipment. */
        origin: DhlTrackingLocation;
        /** Destination location of the shipment. */
        destination: DhlTrackingLocation;
        /** Most recent tracking event representing current status. */
        status: DhlTrackingEvent;
        /** Additional shipment details (structure varies by service). */
        details: unknown;
        /** Chronological list of all tracking events. */
        events: DhlTrackingEvent[];
    }[];
};

/** Parameters required to call the DHL Shipment Tracking API. */
export type DhlTrackingGetParams = {
    /** DHL shipment tracking number. */
    trackingNumber: string;
    /** DHL developer API key for authentication. */
    apiKey: string;
    /** Base URL of the DHL Tracking API. */
    apiUrl: string;
};

// https://developer.dhl.com/api-reference/shipment-tracking#reference-docs-section
/** Endpoint definition for fetching DHL shipment tracking information. */
export const DhlTrackingGet = defineEndpoint({
    request: (params: DhlTrackingGetParams) => ({
        url: `${params.apiUrl}/track/shipments`,
        query: params,
        headers: {
            'DHL-API-Key': params.apiKey,
        },
    }),
    response: jsonResponse<DhlTrackingInfo>,
});
