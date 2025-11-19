/**
 * Toon encoding utilities for token-efficient output
 * Toon format reduces tokens by ~40% for tabular data
 */
export type OutputFormat = 'json' | 'toon';
/**
 * Encode data in the specified format
 * @param data - Data to encode
 * @param format - Output format ('json' or 'toon')
 * @returns Encoded string
 */
export declare function encodeOutput(data: any, format?: OutputFormat): string;
/**
 * Calculate approximate token savings when using Toon
 * @param jsonLength - Length of JSON string
 * @returns Estimated token savings percentage
 */
export declare function estimateTokenSavings(jsonLength: number): number;
