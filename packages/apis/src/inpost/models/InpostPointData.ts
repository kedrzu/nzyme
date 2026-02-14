/**
 *
 */
export interface InpostPointData {
    /**
     *
     */
    name: string;
    /**
     *
     */
    address_details: {
        /**
         *
         */
        city: string;
        /**
         *
         */
        street: string;
        /**
         *
         */
        building_number: number | string;
        /**
         *
         */
        flat_number: number | string;
    };
    /**
     *
     */
    distance: number | null;
    /**
     *
     */
    href: string;
    /**
     *
     */
    type: string[];
    /**
     *
     */
    status: string;
    /**
     *
     */
    location: {
        /**
         *
         */
        longitude: number; /**
         *
         */
        latitude: number;
    };
    /**
     *
     */
    location_type: string | null;
    /**
     *
     */
    location_date: string | null;
    /**
     *
     */
    location_description: string | null;
    /**
     *
     */
    location_description_1: string | null;
    /**
     *
     */
    location_description_2: string | null;
    /**
     *
     */
    opening_hours: string | null;
    /**
     *
     */
    address: {
        /**
         *
         */
        line1: string | null; /**
         *
         */
        line2: string | null;
    };
    /**
     *
     */
    phone_number: string | null;
    /**
     *
     */
    payment_point_descr: string | null;
    /**
     *
     */
    functions: string[];
    /**
     *
     */
    partner_id: number;
    /**
     *
     */
    is_next: boolean;
    /**
     *
     */
    payment_available: boolean;
    /**
     *
     */
    payment_type: unknown;
    /**
     *
     */
    virtual: string | null;
    /**
     *
     */
    recommended_low_interest_box_machines_list: string[];
    /**
     *
     */
    apm_doubled: unknown;
    /**
     *
     */
    location_247: boolean;
    /**
     *
     */
    operating_hours_extended: unknown;
    /**
     *
     */
    agency: string | null;
    /**
     *
     */
    image_url: string | null;
}
