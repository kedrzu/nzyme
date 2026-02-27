// This file is auto-generated. Do not edit manually.

import * as z from 'zod/mini';

import type { ApiResponse, UserProfile } from './complexNested.type.js';

/**
 * API Response wrapper
 */
export const ApiResponseSchema: z.ZodMiniType<ApiResponse> = z
    .object({
        /** Response data */
        data: z.optional(z.unknown().describe('Response data')),
        /** Response metadata */
        meta: z.object({
            page: z.number().describe('Current page number'),
            perPage: z.number().describe('Items per page'),
            total: z.number().describe('Total number of items'),
        }),
        /** Validation errors if any */
        errors: z.optional(
            z.array(
                z.object({
                    code: z.number().describe('Error code'),
                    field: z.string().describe('Field name'),
                    message: z.string().describe('Error message'),
                }),
            ),
        ),
    })
    .describe('API Response wrapper');

/**
 * User profile with nested data
 */
export const UserProfileSchema: z.ZodMiniType<UserProfile> = z
    .object({
        /** Creation timestamp */
        createdAt: z.number().describe('Creation timestamp'),
        /** Additional metadata */
        metadata: z.record(z.string(), z.unknown()).describe('Additional metadata'),
        /** User permissions */
        permissions: z.array(z.string()).describe('User permissions'),
        /** User preferences */
        preferences: z.object({
            language: z.string().describe('Preferred language'),
            notifications: z.boolean().describe('Notifications enabled'),
            theme: z.enum(['dark', 'light']).describe('UI theme preference'),
        }),
        /** User basic info */
        user: z.object({
            avatar: z.nullish(z.string()).describe('User avatar URL'),
            id: z.number().describe('User ID'),
            name: z.string().describe('User name'),
        }),
    })
    .describe('User profile with nested data');
