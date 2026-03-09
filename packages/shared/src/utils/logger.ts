// packages/shared/src/utils/logger.ts
// This replaces console.log everywhere. Never use console.log directly.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

type LogHandler = (entry: LogEntry) => void;

class Logger {
  private handlers: LogHandler[] = [];
  private minLevel: LogLevel = 'info';

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  addHandler(handler: LogHandler): void {
    this.handlers.push(handler);
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;
    const entry: LogEntry = { level, message, context, timestamp: new Date().toISOString() };
    this.handlers.forEach(h => h(entry));
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.emit('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.emit('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.emit('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.emit('error', message, context);
  }
}

export const logger = new Logger();

// Default handler: write to stderr for errors/warnings, stdout for rest
logger.addHandler((entry) => {
  const line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${
    entry.context ? ' ' + JSON.stringify(entry.context) : ''
  }`;
  if (entry.level === 'error' || entry.level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
});
