// This file is auto-generated. Do not edit manually.

import * as z from 'zod/mini';

import type { User as UserType } from './simpleInterface.type.js';

/**
 * User interface for authentication
 * @since 1.0.0
 * @author John Doe
 */
export const User: z.ZodMiniType<UserType> = z
    .object({
        /** User's unique identifier */
        id: z.number(),
        /** User's full name */
        name: z.string().check(z.describe('This is the full name of the user')),
        /** User's email address */
        email: z.string().check(z.describe('This is the email address of the user')),
        /** Whether the user is active */
        active: z.optional(
            z.boolean().check(z.describe('This is a boolean value that indicates if the user is active')),
        ),
    })
    .check(z.describe('This is a simple interface for a user'));

export type User = UserType;
