import type { Currency } from './Currency.js';

/**
 * Money value
 * @example [100, 'USD']
 */
export type Money = [amount: number, currency: Currency];
