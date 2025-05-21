import type { Injectable } from '../Injectable.js';
import type { Service } from '../Service.js';
import { getAllDeps } from './getAllDeps.js';

/**
 * Checks if a service is dependent on an injectable.
 */
export function isDependentOn(service: Service, injectable: Injectable): boolean {
    const deps = getAllDeps(service);
    return deps.has(injectable);
}
