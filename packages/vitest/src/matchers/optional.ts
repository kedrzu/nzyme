import { AsymmetricMatcher } from '@vitest/expect';
import { expect } from 'vitest';

class Optional extends AsymmetricMatcher<void> {
    constructor(private readonly matcher: AsymmetricMatcher<void>) {
        super();
    }

    asymmetricMatch(other: unknown) {
        if (other === undefined) {
            return true;
        }

        return this.matcher.asymmetricMatch(other);
    }

    override toString(): string {
        return `${this.matcher.toString()} | undefined`;
    }

    override toAsymmetricMatcher(): string {
        return this.toString();
    }
}

/**
 *
 */
export function optional<T>(matcher?: AsymmetricMatcher<void>) {
    if (!matcher) {
        matcher = expect.anything() as AsymmetricMatcher<void>;
    }

    return new Optional(matcher) as unknown as T | undefined;
}
