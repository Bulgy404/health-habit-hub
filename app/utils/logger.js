import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Structured JSON logger (production) / pretty-printed logger (development).
 *
 * Every log line carries level, time, pid, and any fields passed as the
 * first argument. Use child loggers for per-module context:
 *
 *   import { logger } from '../utils/logger.js';
 *   const log = logger.child({ module: 'habitService' });
 */
export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base: { pid: process.pid },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  },
  isDev
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid',
        },
      })
    : undefined
);
