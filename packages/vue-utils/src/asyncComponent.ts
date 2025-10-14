import type { Component } from './component.js';

/**
 * Async component import.
 */
export type AsyncComponent<T extends Component = Component> = () => Promise<{ default: T }>;

/**
 * Async component import.
 *
 * @param promise - The promise to import the component from.
 * @returns The component.
 */
export function asyncComponent<T>(fcn: () => Promise<{ default: T }>) {
    return () => fcn().then(m => m.default);
}
