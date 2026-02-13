import type { Injectable } from '@nzyme/ioc/Injectable.js';

import { useContainer } from './useContainer.js';

export function useService<T>(service: Injectable<T>): T {
    return useContainer().resolve(service);
}
