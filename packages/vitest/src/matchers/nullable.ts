import { AsymmetricMatcher } from '@vitest/expect';
import { expect } from 'vitest';

class Nullable extends AsymmetricMatcher<void> {
    constructor(private readonly matcher: AsymmetricMatcher<void>) {
        super();
    }

    asymmetricMatch(other: unknown) {
        if (other === null) {
            return true;
        }

        return this.matcher.asymmetricMatch(other);
    }

    override toString(): string {
        return `${this.matcher.toString()} | null`;
    }

    override toAsymmetricMatcher(): string {
        return this.toString();
    }
}

/** Creates an asymmetric matcher that accepts null in addition to the given matcher. */
export function nullable<T>(matcher?: AsymmetricMatcher<void>) {
    if (!matcher) {
        matcher = expect.anything() as AsymmetricMatcher<void>;
    }

    return new Nullable(matcher) as unknown as T | null;
}
