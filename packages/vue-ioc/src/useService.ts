import type { Injectable } from '@nzyme/ioc/Injectable.js';

import { useContainer } from './useContainer.js';

/** Resolves an injectable service from the nearest IoC container. */
export function useService<T>(service: Injectable<T>): T {
    return useContainer().resolve(service);
}
