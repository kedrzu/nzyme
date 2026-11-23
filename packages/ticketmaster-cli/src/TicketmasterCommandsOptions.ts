import type { Injectable } from '@nzyme/ioc/Injectable.js';

/** Options of {@link defineTicketmasterCommands}. */
export interface TicketmasterCommandsOptions {
    /** The command path prefix, space-separated. Default `ticketmaster`. */
    prefix?: string;
    /**
     * The API key, usually the consumer's `defineSecret`. Resolved only when a request is about to be
     * sent, so `--help` works without it.
     */
    apiKey: Injectable<string>;
    /**
     * The locales to search, sent as `locale`. Default `*`: the API's own default, `en-us`, drops events
     * published only in another locale.
     */
    locale?: string;
    /** The Discovery API base url; for tests and proxies. */
    baseUrl?: string;
}

/** What every Ticketmaster command is defined with: the options with their defaults applied. */
export interface TicketmasterCommandParams {
    /** The command path prefix, space-separated. */
    prefix: string;
    /** The API key, resolved through the command's container. */
    apiKey: Injectable<string>;
    /** The locales to search, sent as `locale`. */
    locale: string;
    /** The Discovery API base url; the production one when unset. */
    baseUrl?: string;
}
