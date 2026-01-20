import pino from "pino";

/**
 * Detect if running in a compiled Bun binary.
 * Compiled binaries run from /$bunfs/ virtual filesystem.
 */
function isCompiledBinary(): boolean {
  return import.meta.url.startsWith("file:///$bunfs/");
}

/**
 * Determine if we should use pretty printing.
 * Pretty print when DEBUG is set or NODE_ENV=development.
 * Never use pretty printing in compiled binaries (pino-pretty can't be resolved).
 */
function isPrettyMode(): boolean {
  if (isCompiledBinary()) {
    return false;
  }
  return Boolean(process.env.DEBUG) || process.env.NODE_ENV === "development";
}

/**
 * Determine the log level based on environment variables.
 * Priority: LOG_LEVEL > DEBUG (sets debug) > default (info)
 */
function getLogLevel(): pino.Level {
  if (process.env.LOG_LEVEL) {
    const level = process.env.LOG_LEVEL.toLowerCase();
    const validLevels: pino.Level[] = ["trace", "debug", "info", "warn", "error", "fatal"];
    if (validLevels.includes(level as pino.Level)) {
      return level as pino.Level;
    }
  }

  if (process.env.DEBUG) {
    return "debug";
  }

  return "info";
}

/**
 * Create pino transport configuration.
 * Uses pino-pretty in development/debug mode, standard JSON otherwise.
 */
function createTransport(): pino.TransportSingleOptions | undefined {
  if (isPrettyMode()) {
    return {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
        destination: 2, // stderr
      },
    };
  }

  return undefined;
}

/**
 * Create the base pino logger configuration.
 */
function createLoggerOptions(): pino.LoggerOptions {
  const level = getLogLevel();
  const transport = createTransport();

  const options: pino.LoggerOptions = {
    level,
    base: {
      name: "upkeep",
    },
  };

  if (transport) {
    options.transport = transport;
  }

  return options;
}

/**
 * Create the base pino logger instance.
 * Writes to stderr to keep stdout clean for command output.
 */
function createBaseLogger(): pino.Logger {
  const options = createLoggerOptions();

  // When using a transport (pino-pretty), the destination is configured in the transport options.
  // When not using a transport (JSON mode), we need to explicitly set the destination to stderr.
  if (options.transport) {
    return pino(options);
  }

  // Use pino.destination(2) for stderr when in JSON mode
  return pino(options, pino.destination(2));
}

/**
 * The default logger instance for the upkeep CLI.
 *
 * Writes to stderr to keep stdout clean for command output (JSON, etc.).
 * Uses pino-pretty transport in development (when DEBUG or NODE_ENV=development).
 * Uses standard JSON output in production.
 *
 * Log levels:
 * - trace: Fine-grained debug information
 * - debug: Detailed debug information
 * - info: General operational information
 * - warn: Warning messages
 * - error: Error messages
 * - fatal: Critical errors that cause the application to stop
 *
 * @example
 * ```typescript
 * import { logger } from './lib/logger';
 *
 * logger.info('Starting upkeep');
 * logger.debug({ packageManager: 'pnpm' }, 'Detected package manager');
 * ```
 */
export const logger = createBaseLogger();

/**
 * Create a child logger with additional context.
 * Useful for creating command-specific loggers.
 *
 * @param context - The context name (e.g., command name)
 * @returns A child logger with the context bound
 *
 * @example
 * ```typescript
 * import { createLogger } from './lib/logger';
 *
 * const cmdLogger = createLogger('detect');
 * cmdLogger.info('Running detect command');
 * cmdLogger.debug({ path: '/path/to/project' }, 'Analyzing project');
 * ```
 */
export function createLogger(context: string): pino.Logger {
  return logger.child({ context });
}

export type { Logger } from "pino";
