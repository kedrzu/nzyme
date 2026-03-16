/**
 * Status enumeration for entities
 */
export type Status = 'active' | 'inactive' | 'pending';

/**
 * User role with permissions
 * @description User role with permissions
 */
export type UserRole = 'admin' | 'guest' | 'user';

/**
 * Nullable string type
 */
export type NullableString = string | null;

/**
 * Optional number type
 */
export type OptionalNumber = number | undefined;

/**
 * Nullish bigint type
 * @description Nullish bigint type
 */
export type NullishBigInt = bigint | null | undefined;
