/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/**
 * Logger interface for agent output
 */
export interface AgentLogger {
  /**
   * Log a debug message
   */
  debug(message: string, meta?: Record<string, unknown>): void;

  /**
   * Log an info message
   */
  info(message: string, meta?: Record<string, unknown>): void;

  /**
   * Log a warning message
   */
  warn(message: string, meta?: Record<string, unknown>): void;

  /**
   * Log an error message
   */
  error(
    message: string,
    error?: Error | unknown,
    meta?: Record<string, unknown>,
  ): void;

  /**
   * Get current log level
   */
  getLevel(): LogLevel;

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void;
}

/**
 * Console-based logger implementation
 */
const formatMeta = (meta?: Record<string, unknown>): string => {
  if (!meta) {
    return "";
  }

  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return " [unserializable meta]";
  }
};

const writeToStdout = (
  level: string,
  message: string,
  meta?: Record<string, unknown>,
): void => {
  const suffix = formatMeta(meta);
  process.stdout.write(`[${level}] ${message}${suffix}\n`);
};

export class ConsoleLogger implements AgentLogger {
  private level: LogLevel;

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    if (this.level <= LogLevel.DEBUG) {
      writeToStdout("DEBUG", message, meta);
    }
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    if (this.level <= LogLevel.INFO) {
      writeToStdout("INFO", message, meta);
    }
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, meta ? meta : "");
    }
  }

  public error(
    message: string,
    error?: Error | unknown,
    meta?: Record<string, unknown>,
  ): void {
    if (this.level <= LogLevel.ERROR) {
      if (error) {
        console.error(`[ERROR] ${message}`, error, meta ? meta : "");
      } else {
        console.error(`[ERROR] ${message}`, meta ? meta : "");
      }
    }
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }
}

/**
 * No-op logger that suppresses all output
 */
export class SilentLogger implements AgentLogger {
  public debug(message: string, meta?: Record<string, unknown>): void {
    void message;
    void meta;
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    void message;
    void meta;
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    void message;
    void meta;
  }

  public error(
    message: string,
    error?: Error | unknown,
    meta?: Record<string, unknown>,
  ): void {
    void message;
    void error;
    void meta;
  }

  public getLevel(): LogLevel {
    return LogLevel.SILENT;
  }

  public setLevel(level: LogLevel): void {
    void level;
  }
}

/**
 * Default logger instance
 */
let defaultLogger: AgentLogger = new ConsoleLogger(LogLevel.WARN);

/**
 * Get the default logger
 */
export function getDefaultLogger(): AgentLogger {
  return defaultLogger;
}

/**
 * Set the default logger
 */
export function setDefaultLogger(logger: AgentLogger): void {
  defaultLogger = logger;
}
