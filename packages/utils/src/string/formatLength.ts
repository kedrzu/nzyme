/**
 * Length unit
 */
export type LengthUnit = 'mm' | 'cm' | 'm' | 'km';

const lengthFormat = new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

const CENTIMETER = 10;
const METER = 1000;
const KILOMETER = 1000 * 1000;

/**
 * Format length
 */
export function formatLength(meters: number | null | undefined): string;
/**
 * Format length
 */
export function formatLength(value: number | null | undefined, unit: LengthUnit): string;
/**
 * Format length
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

function normalizeLength(value: number, unit: LengthUnit) {
    switch (unit) {
        case 'mm':
            return value;
        case 'cm':
            return value * CENTIMETER;
        case 'm':
            return value * METER;
        case 'km':
            return value * KILOMETER;
    }
}
