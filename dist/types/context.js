/**
 * Application context types for Basher
 *
 * This module defines the AppContext interface that provides
 * a centralized container for all service dependencies.
 * This enables cleaner dependency injection and easier testing.
 */
/**
 * Create a standard tool result from data
 */
export function createToolResult(data) {
    return {
        content: [{
                type: 'text',
                text: JSON.stringify(data, null, 2),
            }],
    };
}
