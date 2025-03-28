import type { DateTimeISO } from '@nzyme/types';

import type { InpostStatus } from './InpostStatus.js';

export type InpostTrackingData = {
    tracking_number: string;
    service: string;
    type: string;
    status: InpostStatus;
    custom_attributes: {
        size: string;
        target_machine_id: string;
        target_machine_detail: {
            name: string;
            opening_hours: string;
            location_description: string;
            location: {
                latitude: number;
                longitude: number;
            };
            address: {
                line1: string;
                line2: string;
            };
            type: string[];
            location247: boolean;
        };
        end_of_week_collection: boolean;
    };
    tracking_details: {
        origin_status: string;
        status: InpostStatus;
        agency: null;
        location: null;
        datetime: DateTimeISO;
    }[];
    expected_flow: InpostStatus[];
    created_at: DateTimeISO;
    updated_at: DateTimeISO;
};
