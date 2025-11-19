/**
 * Toon encoding utilities for token-efficient output
 * Toon format reduces tokens by ~40% for tabular data
 */
import { encode } from '@toon-format/toon';
/**
 * Encode data in the specified format
 * @param data - Data to encode
 * @param format - Output format ('json' or 'toon')
 * @returns Encoded string
 */
export function encodeOutput(data, format = 'json') {
    if (format === 'toon') {
        try {
            return encode(data);
        }
        catch (error) {
            // Fallback to JSON if Toon encoding fails
            console.error('Toon encoding failed, falling back to JSON:', error);
            return JSON.stringify(data, null, 2);
        }
    }
    return JSON.stringify(data, null, 2);
}
/**
 * Calculate approximate token savings when using Toon
 * @param jsonLength - Length of JSON string
 * @returns Estimated token savings percentage
 */
export function estimateTokenSavings(jsonLength) {
    // Toon typically saves ~40% tokens for tabular data
    return Math.round(jsonLength * 0.4);
}
