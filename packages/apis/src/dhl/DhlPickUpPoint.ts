export interface DhlPickUpPoint {
    id: string;
    harmonisedId: string;
    psfKey: string;
    shopType: string;
    name: string;
    keyword: string;
    address: {
        countryCode: string;
        zipCode: string;
        city: string;
        street: string;
        number: string;
        isBusiness: boolean;
        postalCode: string;
    };
    geoLocation: { latitude: number; longitude: number };
    distance: number;
    openingTimes: { timeFrom: string; timeTo: string; weekDay: number }[];
    closurePeriods: [];
    serviceTypes: string[];
}
