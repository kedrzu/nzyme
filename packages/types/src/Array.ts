/**
 * Get the type of the first item of the array
 */
export type ArrayItem<T extends readonly unknown[]> = T[keyof T & number];

/**
 * Array with at least one item
 */
export type ArrayNotEmpty<T> = [T, ...T[]];
