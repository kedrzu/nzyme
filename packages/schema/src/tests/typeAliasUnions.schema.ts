// This file is auto-generated. Do not edit manually.

import * as z from 'zod/mini';

import type { NullableString, NullishBigInt, OptionalNumber, Status, UserRole } from './typeAliasUnions.type.js';

/**
 * Status enumeration for entities
 */
export const StatusSchema: z.ZodMiniType<Status> = z.enum(['active', 'inactive', 'pending']);

/**
 * User role with permissions
 */
export const UserRoleSchema: z.ZodMiniType<UserRole> = z
    .enum(['admin', 'guest', 'user'])
    .check(z.describe('User role with permissions'));

/**
 * Nullable string type
 */
export const NullableStringSchema: z.ZodMiniType<NullableString> = z.nullable(z.string());

/**
 * Optional number type
 */
export const OptionalNumberSchema: z.ZodMiniType<OptionalNumber> = z.optional(z.number());

/**
 * Nullish bigint type
 */
export const NullishBigIntSchema: z.ZodMiniType<NullishBigInt> = z
    .nullish(z.bigint())
    .check(z.describe('Nullish bigint type'));
