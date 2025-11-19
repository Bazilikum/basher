/**
 * Logger configuration using Pino
 * Provides structured JSON logging with file and console outputs
 */
import pino from 'pino';
declare const logger: pino.Logger<never, boolean>;
export default logger;
