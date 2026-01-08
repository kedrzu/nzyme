// This file is auto-generated. Do not edit manually.

import * as s from 'sury';

import type { Status, UserRole } from './typeAliasUnions.type.js';

/**
 * Status enumeration for entities
 */
export const StatusSchema: s.Schema<Status, s.UnknownToInput<Status>> = s.union(['active', 'inactive', 'pending']);

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
export const NullableStringSchema = s.nullable(s.string);

/**
 * Optional number type
 */
export const OptionalNumberSchema = s.optional(s.number);

/**
 * Nullish bigint type
 */
export const NullishBigIntSchema = s.nullable(s.bigint).with(s.meta, {
    description: 'Nullish bigint type',
});
