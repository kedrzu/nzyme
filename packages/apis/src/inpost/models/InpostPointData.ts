/** InPost parcel locker or pick-up point data returned by the InPost Points API. */
export interface InpostPointData {
    /** Unique machine/point name identifier (e.g. "KRA01A"). */
    name: string;
    /** Structured address details of the point. */
    address_details: {
        /** City where the point is located. */
        city: string;
        /** Street name. */
        street: string;
        /** Building number. */
        building_number: number | string;
        /** Flat or unit number within the building. */
        flat_number: number | string;
    };
    /** Distance from the searched location in metres, or null if not applicable. */
    distance: number | null;
    /** API URL for fetching full details of this point. */
    href: string;
    /** Types of service available at this point (e.g. "parcel_locker", "pop"). */
    type: string[];
    /** Operational status of the point (e.g. "Operating", "NonOperating"). */
    status: string;
    /** Geographic coordinates of the point. */
    location: {
        /** Longitude in decimal degrees. */
        longitude: number;
        /** Latitude in decimal degrees. */
        latitude: number;
    };
    /** Category of the physical location (e.g. "outdoor", "indoor"), or null if unknown. */
    location_type: string | null;
    /** Date when the point was installed or last relocated, or null if unavailable. */
    location_date: string | null;
    /** Primary description of how to find the point. */
    location_description: string | null;
    /** Additional location guidance (first supplementary line). */
    location_description_1: string | null;
    /** Additional location guidance (second supplementary line). */
    location_description_2: string | null;
    /** Human-readable opening hours string, or null for 24/7 points. */
    opening_hours: string | null;
    /** Formatted address lines for display purposes. */
    address: {
        /** First address line (typically street and number). */
        line1: string | null;
        /** Second address line (typically postal code and city). */
        line2: string | null;
    };
    /** Contact phone number for the point, or null if unavailable. */
    phone_number: string | null;
    /** Description of the associated payment point, or null if none. */
    payment_point_descr: string | null;
    /** Supported functions at this point (e.g. "parcel_send", "parcel_collect"). */
    functions: string[];
    /** Identifier of the partner operating this point. */
    partner_id: number;
    /** Whether this is a next-generation InPost point. */
    is_next: boolean;
    /** Whether payment on delivery is available at this point. */
    payment_available: boolean;
    /** Payment type configuration (structure varies). */
    payment_type: unknown;
    /** Virtual point identifier, or null for physical locations. */
    virtual: string | null;
    /** List of recommended nearby locker machines with lower demand. */
    recommended_low_interest_box_machines_list: string[];
    /** Information about doubled APM capacity (structure varies). */
    apm_doubled: unknown;
    /** Whether the point operates 24 hours a day, 7 days a week. */
    location_247: boolean;
    /** Extended operating hours configuration (structure varies). */
    operating_hours_extended: unknown;
    /** Agency identifier if the point is operated by a third-party agent, or null. */
    agency: string | null;
    /** URL to an image of the point location, or null if unavailable. */
    image_url: string | null;
}
