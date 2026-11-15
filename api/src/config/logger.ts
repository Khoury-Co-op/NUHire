// Leveled logging for the API. The level comes from LOG_LEVEL (debug, info,
// warn, error; default info), so per-request tracing is silent during a live
// class unless someone turns it on.
//
// The methods take exactly what console.* took, so a call site migrates by
// renaming. Pino's own signature is (mergingObject, message, ...interpolation)
// and it drops extra arguments that have no placeholder; running them through
// util.format first keeps every existing message intact.

import pino from 'pino';
import { format } from 'util';

const LEVELS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);

const requested = (process.env.LOG_LEVEL || 'info').toLowerCase();
const level = LEVELS.has(requested) ? requested : 'info';

// Human-readable output in development, one JSON object per line otherwise.
const pretty = process.env.LOG_PRETTY === 'true' || process.env.NODE_ENV !== 'production';

const base = pino({
  level,
  ...(pretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
        },
      }
    : {}),
});

const fmt = (args: unknown[]): string =>
  args.length === 0 ? '' : format(...(args as [unknown, ...unknown[]]));

export const logger = {
  debug: (...args: unknown[]): void => base.debug(fmt(args)),
  info: (...args: unknown[]): void => base.info(fmt(args)),
  warn: (...args: unknown[]): void => base.warn(fmt(args)),
  error: (...args: unknown[]): void => base.error(fmt(args)),
};
