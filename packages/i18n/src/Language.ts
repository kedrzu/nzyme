/**
 *
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Languages {}

/**
 *
 */
export type Language = keyof Languages extends never ? string : keyof Languages;
