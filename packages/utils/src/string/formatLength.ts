/**
 * Length unit for formatting measurements
 */
export type LengthUnit = 'cm' | 'km' | 'm' | 'mm';

const lengthFormat = new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

const CENTIMETER = 10;
const METER = 1000;
const KILOMETER = 1000 * 1000;

/**
 * Formats a length value in meters to a human-readable string with appropriate unit.
 * @util
 *
 * @param meters - The length value in meters
 * @returns A formatted string with the length and appropriate unit
 */
export function formatLength(meters: number | null | undefined): string;
/**
 * Formats a length value in the specified unit to a human-readable string.
 * @util
 *
 * @param value - The length value
 * @param unit - The unit of the input value
 * @returns A formatted string with the length and appropriate unit
 */
export function formatLength(value: number | null | undefined, unit: LengthUnit): string;
/**
 * Formats a length value to a human-readable string, automatically choosing the most appropriate unit.
 * @util
 *
 * @param value - The length value
 * @param unit - Optional unit of the input value (defaults to meters)
 * @returns A formatted string with the length and appropriate unit
 */
export function formatLength(value: number | null | undefined, unit?: LengthUnit): string {
    if (value == null) {
        return '';
    }

    value = normalizeLength(value, unit ?? 'm');

    if (value === 0) {
        return `0\u202f${unit}`;
    }

    if (value < CENTIMETER) {
        return `${value}\u202fmm`;
    }

    if (value < METER) {
        return `${lengthFormat.format(value / CENTIMETER)}\u202fcm`;
    }

    if (value < KILOMETER) {
        return `${lengthFormat.format(value / METER)}\u202fm`;
    }

    return `${lengthFormat.format(value / KILOMETER)}\u202fkm`;
}

/**
 * Normalizes a length value to millimeters based on the input unit.
 *
 * @param value - The length value to normalize
 * @param unit - The unit of the input value
 * @returns The length value in millimeters
 */
function normalizeLength(value: number, unit: LengthUnit) {
    switch (unit) {
        case 'cm':
            return value * CENTIMETER;
        case 'km':
            return value * KILOMETER;
        case 'm':
            return value * METER;
        case 'mm':
            return value;
    }
}
