// Public interface of @nile/logger (design 01 §2, §11). Server code only: JSON lines to stdout, with the
// redaction list applied to every field, so a token or a password can't reach a log by accident.

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Field names whose values are never written (compared case-insensitively, at any depth). */
export const REDACTED_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'accessToken',
  'refreshToken',
  'password',
  'currentPassword',
  'newPassword',
  'otp',
  'token',
  'recipientPhone',
  'phone',
  'contactPhone',
  'street',
  'building',
  'floor',
  'apartment',
  'landmark',
] as const;

export const REDACTED = '[REDACTED]';

const REDACTED_SET = new Set<string>(REDACTED_KEYS.map((key) => key.toLowerCase()));
const MAX_DEPTH = 6;

export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  fatal(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  debug(message: string, fields?: LogFields): void;
  /** A logger that adds `fields` to every line (e.g. `{ correlationId }`). */
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  app: string;
  level: LogLevel;
  /** Deployment environment written on every line (`NODE_ENV`). */
  env: string;
  /** Where lines go; stdout by default. Tests pass a collector. */
  write?: (line: string) => void;
  now?: () => Date;
}

function serializeError(error: Error, depth: number): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    ...(error.stack === undefined ? {} : { stack: error.stack }),
    ...(error.cause === undefined ? {} : { cause: sanitize(error.cause, depth + 1) }),
  };
}

/** Copy of `value` with redacted keys replaced, errors made serialisable and deep structures cut off. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[Truncated]';
  if (value instanceof Error) return serializeError(value, depth);
  if (Array.isArray(value)) return value.map((item: unknown) => sanitize(item, depth + 1));
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object' || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = REDACTED_SET.has(key.toLowerCase()) ? REDACTED : sanitize(item, depth + 1);
  }
  return result;
}

const defaultWrite = (line: string): void => {
  process.stdout.write(line);
};

export function createLogger(options: LoggerOptions): Logger {
  const threshold = LOG_LEVELS.indexOf(options.level);
  const write = options.write ?? defaultWrite;
  const now = options.now ?? (() => new Date());

  const build = (bound: LogFields): Logger => {
    const log = (level: LogLevel, message: string, fields: LogFields = {}): void => {
      if (LOG_LEVELS.indexOf(level) > threshold) return;
      // Base keys last, so a caller's field can't overwrite level, timestamp or app.
      const line = {
        ...(sanitize({ ...bound, ...fields }) as Record<string, unknown>),
        level,
        timestamp: now().toISOString(),
        message,
        app: options.app,
        env: options.env,
      };
      write(`${JSON.stringify(line)}\n`);
    };
    return {
      fatal: (message, fields) => {
        log('fatal', message, fields);
      },
      error: (message, fields) => {
        log('error', message, fields);
      },
      warn: (message, fields) => {
        log('warn', message, fields);
      },
      info: (message, fields) => {
        log('info', message, fields);
      },
      debug: (message, fields) => {
        log('debug', message, fields);
      },
      child: (fields) => build({ ...bound, ...fields }),
    };
  };

  return build({});
}
