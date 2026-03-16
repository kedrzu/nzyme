import type { DateTimeISO } from '@nzyme/types/Date.js';

import type { InpostStatus } from './InpostStatus.js';

/** Tracking data for an InPost parcel shipment. */
export type InpostTrackingData = {
    /** InPost parcel tracking number. */
    tracking_number: string;
    /** Name of the InPost service used (e.g. "inpost_locker_standard"). */
    service: string;
    /** Shipment type identifier. */
    type: string;
    /** Current tracking status of the parcel. */
    status: InpostStatus;
    /** Service-specific attributes for this shipment. */
    custom_attributes: {
        /** Parcel size class (e.g. "A", "B", "C"). */
        size: string;
        /** Identifier of the target locker machine for delivery. */
        target_machine_id: string;
        /** Detailed information about the target locker machine. */
        target_machine_detail: {
            /** Human-readable name of the locker machine. */
            name: string;
            /** Opening hours of the locker machine. */
            opening_hours: string;
            /** Description of how to find the locker machine. */
            location_description: string;
            /** Geographic coordinates of the locker machine. */
            location: {
                /** Latitude in decimal degrees. */
                latitude: number;
                /** Longitude in decimal degrees. */
                longitude: number;
            };
            /** Formatted address of the locker machine. */
            address: {
                /** First address line (street and number). */
                line1: string;
                /** Second address line (postal code and city). */
                line2: string;
            };
            /** Types of service supported by this machine. */
            type: string[];
            /** Whether the machine is accessible 24/7. */
            location247: boolean;
        };
        /** Whether this parcel is scheduled for end-of-week collection. */
        end_of_week_collection: boolean;
    };
    /** Chronological list of tracking events for this parcel. */
    tracking_details: {
        /** Raw status string as returned by the InPost backend. */
        origin_status: string;
        /** Normalised tracking status. */
        status: InpostStatus;
        /** Agency handling the parcel at this stage, if applicable. */
        agency: null;
        /** Location associated with this tracking event, if applicable. */
        location: null;
        /** Timestamp of when this tracking event occurred. */
        datetime: DateTimeISO;
    }[];
    /** Ordered list of statuses the parcel is expected to go through. */
    expected_flow: InpostStatus[];
    /** Timestamp when the shipment record was created. */
    created_at: DateTimeISO;
    /** Timestamp when the shipment record was last updated. */
    updated_at: DateTimeISO;
};
