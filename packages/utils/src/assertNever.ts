/**
 * Marks a branch the type system proves unreachable — the `default` of a `switch` over a
 * discriminated union, or the tail of an exhaustive `if` chain.
 * @util
 *
 * Two things it buys. At compile time the parameter is `never`, so adding a member to the union
 * breaks the build at every switch that does not handle it — the failure lands on the code that
 * needs updating rather than showing up as a silent `undefined` later. At runtime it throws, so a
 * value that slips past the types (a payload off the wire, an enum widened by a migration) fails
 * where it appears instead of propagating.
 *
 * The message carries the value only when it is a string or a number — the discriminants these
 * switches actually run on. Anything else is omitted rather than serialised, because an object
 * reaching here could hold patient data and an error message is not a place for it.
 *
 * @param value - The value that should be impossible
 * @param message - Optional context, e.g. what was being resolved
 * @throws {Error} Always
 *
 * @example
 * ```ts
 * switch (event.type) {
 *     case 'CHAT_START':
 *         return handleStart(event);
 *     case 'CHAT_END':
 *         return handleEnd(event);
 *     default:
 *         return assertNever(event.type, 'Unhandled chat event');
 * }
 * ```
 */
export function assertNever(value: never, message?: string): never {
    const described = typeof value === 'string' || typeof value === 'number' ? `: ${String(value)}` : '';

    throw new Error(`${message ?? 'Unreachable branch reached'}${described}`);
}
