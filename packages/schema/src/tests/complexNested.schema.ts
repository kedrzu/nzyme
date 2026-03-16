// This file is auto-generated. Do not edit manually.

import * as z from 'zod/mini';

import type { ApiResponse, UserProfile } from './complexNested.type.js';

/**
 * API Response wrapper
 */
export const ApiResponseSchema: z.ZodMiniType<ApiResponse> = z
    .object({
        /** Response data */
        data: z.optional(z.unknown().check(z.describe('Response data'))),
        /** Response metadata */
        meta: z.object({
            page: z.number().check(z.describe('Current page number')),
            perPage: z.number().check(z.describe('Items per page')),
            total: z.number().check(z.describe('Total number of items')),
        }),
        /** Validation errors if any */
        errors: z.optional(
            z.array(
                z.object({
                    code: z.number().check(z.describe('Error code')),
                    field: z.string().check(z.describe('Field name')),
                    message: z.string().check(z.describe('Error message')),
                }),
            ),
        ),
    })
    .check(z.describe('API Response wrapper'));

/**
 * User profile with nested data
 */
export const UserProfileSchema: z.ZodMiniType<UserProfile> = z
    .object({
        /** Creation timestamp */
        createdAt: z.number().check(z.describe('Creation timestamp')),
        /** Additional metadata */
        metadata: z.record(z.string(), z.unknown()).check(z.describe('Additional metadata')),
        /** User permissions */
        permissions: z.array(z.string()).check(z.describe('User permissions')),
        /** User preferences */
        preferences: z.object({
            language: z.string().check(z.describe('Preferred language')),
            notifications: z.boolean().check(z.describe('Notifications enabled')),
            theme: z.enum(['dark', 'light']).check(z.describe('UI theme preference')),
        }),
        /** User basic info */
        user: z.object({
            avatar: z.nullish(z.string()).check(z.describe('User avatar URL')),
            id: z.number().check(z.describe('User ID')),
            name: z.string().check(z.describe('User name')),
        }),
    })
    .check(z.describe('User profile with nested data'));
