// Leveled logging for the browser. Defaults to warn in production and debug in
// development; NEXT_PUBLIC_LOG_LEVEL overrides either. The methods take what
// console.* took, so call sites migrate by renaming.

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

const fallback: Level = process.env.NODE_ENV === 'production' ? 'warn' : 'debug';
const requested = (process.env.NEXT_PUBLIC_LOG_LEVEL || fallback).toLowerCase();
const threshold = LEVELS[requested as Level] ?? LEVELS[fallback];

const enabled = (level: Level): boolean => LEVELS[level] >= threshold;

export const logger = {
  debug: (...args: unknown[]): void => {
    if (enabled('debug')) console.debug(...args);
  },
  info: (...args: unknown[]): void => {
    if (enabled('info')) console.info(...args);
  },
  warn: (...args: unknown[]): void => {
    if (enabled('warn')) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    if (enabled('error')) console.error(...args);
  },
};
