// This file is auto-generated. Do not edit manually.

import * as s from 'sury';

import type { ApiResponse, UserProfile } from './complexNested.type.js';

/**
 * API Response wrapper
 */
export const ApiResponseSchema: s.Schema<ApiResponse, s.UnknownToInput<ApiResponse>> = s
    .schema({
        /** Response data */
        data: s.unknown.with(s.meta, {
            description: 'Response data',
        }),
        /** Response metadata */
        meta: s
            .schema({
                page: s.number.with(s.meta, {
                    description: 'Current page number',
                }),
                perPage: s.number.with(s.meta, {
                    description: 'Items per page',
                }),
                total: s.number.with(s.meta, {
                    description: 'Total number of items',
                }),
            })
            .with(s.meta, {
                description: 'Response metadata',
            }),
        /** Validation errors if any */
        errors: s
            .optional(
                s.array(
                    s.schema({
                        code: s.number.with(s.meta, {
                            description: 'Error code',
                        }),
                        field: s.string.with(s.meta, {
                            description: 'Field name',
                        }),
                        message: s.string.with(s.meta, {
                            description: 'Error message',
                        }),
                    }),
                ),
            )
            .with(s.meta, {
                description: 'Validation errors if any',
            }),
    })
    .with(s.meta, {
        description: 'API Response wrapper',
    });

/**
 * User profile with nested data
 */
export const UserProfileSchema: s.Schema<UserProfile, s.UnknownToInput<UserProfile>> = s
    .schema({
        /** Creation timestamp */
        createdAt: s.number.with(s.meta, {
            description: 'Creation timestamp',
        }),
        /** Additional metadata */
        metadata: s.record(s.unknown).with(s.meta, {
            description: 'Additional metadata',
        }),
        /** User permissions */
        permissions: s.array(s.string).with(s.meta, {
            description: 'User permissions',
        }),
        /** User preferences */
        preferences: s
            .schema({
                language: s.string.with(s.meta, {
                    description: 'Preferred language',
                }),
                notifications: s.boolean.with(s.meta, {
                    description: 'Notifications enabled',
                }),
                theme: s.union(['dark', 'light']).with(s.meta, {
                    description: 'UI theme preference',
                }),
            })
            .with(s.meta, {
                description: 'User preferences',
            }),
        /** User basic info */
        user: s
            .schema({
                avatar: s.nullish(s.string).with(s.meta, {
                    description: 'User avatar URL',
                }),
                id: s.number.with(s.meta, {
                    description: 'User ID',
                }),
                name: s.string.with(s.meta, {
                    description: 'User name',
                }),
            })
            .with(s.meta, {
                description: 'User basic info',
            }),
    })
    .with(s.meta, {
        description: 'User profile with nested data',
    });
