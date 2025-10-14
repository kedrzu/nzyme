// This file is auto-generated. Do not edit manually.

import * as s from 'sury';

import type { Status, UserRole } from './typeAliasUnions.type.js';

/**
 * Status enumeration for entities
 */
export const StatusSchema: s.Schema<Status, s.UnknownToInput<Status>> = s
    .union(['active', 'inactive', 'pending'])
    .with(s.meta, {
        description: 'Status enumeration for entities',
    });

/**
 * User role with permissions
 */
export const UserRoleSchema: s.Schema<UserRole, s.UnknownToInput<UserRole>> = s
    .union(['admin', 'guest', 'user'])
    .with(s.meta, {
        description: 'User role with permissions',
    });

/**
 * Nullable string type
 */
export const NullableStringSchema = s.nullable(s.string).with(s.meta, {
    description: 'Nullable string type',
});

/**
 * Optional number type
 */
export const OptionalNumberSchema = s.optional(s.number).with(s.meta, {
    description: 'Optional number type',
});
