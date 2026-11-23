/** The geohash alphabet: base 32 without `a`, `i`, `l` and `o`. */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Params of {@link encodeGeohash}. */
export interface EncodeGeohashParams {
    /** Degrees, -90 to 90. */
    latitude: number;
    /** Degrees, -180 to 180. */
    longitude: number;
    /** The number of characters; 9 (about 5 m) by default. */
    precision?: number;
}

/**
 * Encodes a point as a geohash: alternating longitude and latitude bisections, five bits per
 * character.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function encodeGeohash({ latitude, longitude, precision = 9 }: EncodeGeohashParams): string {
    const lat = { min: -90, max: 90 };
    const lon = { min: -180, max: 180 };
    let hash = '';
    let bits = 0;
    let char = 0;
    let isLongitude = true;

    while (hash.length < precision) {
        const range = isLongitude ? lon : lat;
        const value = isLongitude ? longitude : latitude;
        const mid = (range.min + range.max) / 2;
        if (value >= mid) {
            char = char * 2 + 1;
            range.min = mid;
        } else {
            char *= 2;
            range.max = mid;
        }

        isLongitude = !isLongitude;
        bits++;
        if (bits === 5) {
            hash += BASE32.charAt(char);
            bits = 0;
            char = 0;
        }
    }

    return hash;
}
