/** DHL parcel pick-up point returned by the DHL ServicePoint API. */
export interface DhlPickUpPoint {
    /** Unique identifier of the pick-up point. */
    id: string;
    /** Cross-system harmonised identifier used to reference this point across DHL platforms. */
    harmonisedId: string;
    /** Parcel-shop finder key used internally by DHL to look up this location. */
    psfKey: string;
    /** Type of pick-up location, e.g. "parcelShop", "locker", or "postOffice". */
    shopType: string;
    /** Human-readable name of the pick-up point. */
    name: string;
    /** Search keyword associated with this pick-up point for discovery purposes. */
    keyword: string;
    /** Physical address of the pick-up point. */
    address: {
        /** ISO 3166-1 alpha-2 country code. */
        countryCode: string;
        /** ZIP / postal code (legacy field, prefer `postalCode`). */
        zipCode: string;
        /** City name. */
        city: string;
        /** Street name. */
        street: string;
        /** Street / building number. */
        number: string;
        /** Whether the address is a business location. */
        isBusiness: boolean;
        /** Postal code of the address. */
        postalCode: string;
        /** Additional address information such as floor or unit. */
        addition?: string;
    };
    /** Geographic coordinates of the pick-up point. */
    geoLocation: {
        /** Latitude in decimal degrees. */
        latitude: number;
        /** Longitude in decimal degrees. */
        longitude: number;
    };
    /** Distance from the searched location in metres. */
    distance: number;
    /** Weekly opening-hours schedule for the pick-up point. */
    openingTimes: {
        /** Opening time in HH:mm format. */
        timeFrom: string;
        /** Closing time in HH:mm format. */
        timeTo: string;
        /** Day of the week (1 = Monday, 7 = Sunday). */
        weekDay: number;
    }[];
    /** Periods during which the pick-up point is closed. */
    closurePeriods: [];
    /** DHL service types available at this pick-up point. */
    serviceTypes: string[];
}
