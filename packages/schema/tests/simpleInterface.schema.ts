// This file is auto-generated. Do not edit manually.

import * as s from 'sury';

import type { User as UserType } from './simpleInterface.type.js';

/**
 * User interface for authentication
 * @since 1.0.0
 * @author John Doe
 */
export const User: s.Schema<UserType, s.UnknownToInput<UserType>> = s
    .schema({
        /** User's unique identifier */
        id: s.number,
        /** User's full name */
        name: s.string.with(s.meta, {
            description: 'This is the full name of the user',
        }),
        /** User's email address */
        email: s.string.with(s.meta, {
            description: 'This is the email address of the user',
        }),
        /** Whether the user is active */
        active: s.optional(
            s.boolean.with(s.meta, {
                description: 'This is a boolean value that indicates if the user is active',
            }),
        ),
    })
    .with(s.meta, {
        description: 'This is a simple interface for a user',
    });

export type User = UserType;
