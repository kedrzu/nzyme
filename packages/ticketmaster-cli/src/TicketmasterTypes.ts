/**
 * Partial shapes of the Ticketmaster Discovery API v2: only the fields the commands read plus the
 * obvious consumer fields. Fields the vendor may omit are optional.
 * @see https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 */

/** An id and name pair, used by classification levels. */
export interface TicketmasterNamed {
    id: string;
    name: string;
}

/** A segment/genre/sub-genre classification of an event or attraction. */
export interface TicketmasterClassification {
    segment?: TicketmasterNamed;
    genre?: TicketmasterNamed;
    subGenre?: TicketmasterNamed;
    /** Genres of a segment, present when the classification is a segment fetched by id. */
    _embedded?: { genres?: TicketmasterNamed[] };
    id?: string;
    name?: string;
}

/** A venue. */
export interface TicketmasterVenue {
    id: string;
    name: string;
    url?: string;
    city?: { name?: string };
    country?: { name?: string; countryCode?: string };
    address?: { line1?: string };
    postalCode?: string;
    location?: { latitude?: string; longitude?: string };
    timezone?: string;
    upcomingEvents?: { _total?: number } & Record<string, number>;
}

/** A performer, team or other attraction. */
export interface TicketmasterAttraction {
    id: string;
    name: string;
    url?: string;
    classifications?: TicketmasterClassification[];
    externalLinks?: Record<string, { url?: string; id?: string }[]>;
    upcomingEvents?: { _total?: number } & Record<string, number>;
}

/** A price range of an event; `type` is e.g. `standard`. */
export interface TicketmasterPriceRange {
    type?: string;
    currency?: string;
    min?: number;
    max?: number;
}

/** When tickets are on sale; UTC ISO date-times. */
export interface TicketmasterSaleWindow {
    startDateTime?: string;
    endDateTime?: string;
}

/** A named presale window. */
export interface TicketmasterPresale extends TicketmasterSaleWindow {
    name?: string;
}

/** An event. */
export interface TicketmasterEvent {
    id: string;
    name: string;
    url?: string;
    info?: string;
    pleaseNote?: string;
    dates?: {
        start?: { localDate?: string; localTime?: string; dateTime?: string };
        timezone?: string;
        status?: { code?: string };
    };
    priceRanges?: TicketmasterPriceRange[];
    sales?: {
        public?: TicketmasterSaleWindow;
        presales?: TicketmasterPresale[];
    };
    classifications?: TicketmasterClassification[];
    _embedded?: {
        venues?: TicketmasterVenue[];
        attractions?: TicketmasterAttraction[];
    };
}

/** Paging of a list response; `number` counts from 0. */
export interface TicketmasterPage {
    size: number;
    totalElements: number;
    totalPages: number;
    number: number;
}

/** A page of items unwrapped from the HAL envelope. */
export interface TicketmasterList<T> {
    items: T[];
    page: TicketmasterPage;
}
