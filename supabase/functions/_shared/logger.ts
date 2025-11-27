/**
 * Structured logging utility for Edge Functions
 */

interface LogEntry extends Record<string, unknown> {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  timestamp: string;
  context?: string;
}

function createLogEntry(
  level: LogEntry['level'],
  message: string,
  context?: string,
  data?: Record<string, unknown>
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context && { context }),
    ...data,
  };
}

export const log = {
  error: (message: string, context?: string, data?: Record<string, unknown>) => {
    const entry = createLogEntry('error', message, context, data);
    console.error(JSON.stringify(entry));
  },

  warn: (message: string, context?: string, data?: Record<string, unknown>) => {
    const entry = createLogEntry('warn', message, context, data);
    console.warn(JSON.stringify(entry));
  },

  info: (message: string, context?: string, data?: Record<string, unknown>) => {
    const entry = createLogEntry('info', message, context, data);
    console.log(JSON.stringify(entry));
  },

  debug: (message: string, context?: string, data?: Record<string, unknown>) => {
    const entry = createLogEntry('debug', message, context, data);
    console.log(JSON.stringify(entry));
  },
};
