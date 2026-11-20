import { UsageError } from '@nzyme/cli-core';

import type { GoogleToken, GoogleTokens } from './googleTokens.js';
import type { GoogleService } from './GoogleService.js';
import { isAccountAllowed } from './utils/isAccountAllowed.js';

/** Params of {@link resolveGoogleAccount}. */
export interface ResolveGoogleAccountParams {
    tokens: GoogleTokens;
    /** The project's `accounts` allowlist; unset allows every account. */
    allowed: string[] | undefined;
    /** The account asked for (`--account`); unset picks the only usable one. */
    account: string | undefined;
    service: GoogleService;
    /** The command signing an account in, named in the errors. */
    signInCommand: string;
}

/**
 * The account a command acts on: `account` when given (it must be signed in and allowed), otherwise
 * the only usable (signed-in and allowed) account. Throws a `UsageError` naming the account and the
 * sign-in command, or listing the usable accounts when several are.
 * @__NO_SIDE_EFFECTS__
 */
export function resolveGoogleAccount(params: ResolveGoogleAccountParams): GoogleToken {
    const { tokens, allowed, account, service, signInCommand } = params;

    if (account) {
        const email = account.toLowerCase();
        if (!isAccountAllowed(email, allowed)) {
            throw new UsageError(`${account} is not in the accounts this project allows.`);
        }

        const entry = tokens.get(email);
        if (!entry) {
            throw new UsageError(
                `${account} has no ${service.name} token. Sign in with \`${signInCommand} --login-hint ${account}\`.`,
            );
        }

        return { email, ...entry };
    }

    const usable = [...tokens]
        .filter(([email]) => isAccountAllowed(email, allowed))
        .toSorted(([a], [b]) => a.localeCompare(b));
    const [only] = usable;
    if (!only) {
        throw new UsageError(`No ${service.name} account is signed in and allowed. Sign in with \`${signInCommand}\`.`);
    }

    if (usable.length > 1) {
        const emails = usable.map(([email]) => email).join(', ');
        throw new UsageError(`Several ${service.name} accounts are usable; choose one with --account: ${emails}.`);
    }

    const [email, entry] = only;
    return { email, ...entry };
}
