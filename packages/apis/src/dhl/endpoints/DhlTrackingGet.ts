import { defineEndpoint, jsonResponse } from '@nzyme/fetch-utils';
import type { DateTimeISO } from '@nzyme/types';

export type DhlTrackingStatus = 'delivered' | 'failure' | 'pre-transit' | 'transit' | 'unknown';

export type DhlTrackingLocation = {
    address?: {
        addressLocality?: string;
        addressLocalityServicing?: string;
        addressRegion?: string;
        countryCode?: string;
        postalCode?: string;
        streetAddress?: string;
    };
    servicePoint?: {
        url: string;
        label: string;
    };
};

export type DhlTrackingEvent = {
    timestamp: DateTimeISO;
    location: DhlTrackingLocation;
    statusCode: DhlTrackingStatus;
    status: string;
    description: string;
    remark?: string;
    nextSteps?: string;
};

export type DhlTrackingInfo = {
    shipments: {
        id: string;
        service: string;
        origin: DhlTrackingLocation;
        destination: DhlTrackingLocation;
        status: DhlTrackingEvent;
        details: unknown;
        events: DhlTrackingEvent[];
    }[];
};

// https://developer.dhl.com/api-reference/shipment-tracking#reference-docs-section
export const DhlTrackingGet = defineEndpoint({
    request: (params: { trackingNumber: string }) => ({
        url: `track/shipments`,
        query: params,
    }),
    response: jsonResponse<DhlTrackingInfo>,
});
