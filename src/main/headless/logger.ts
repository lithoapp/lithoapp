/**
 * Headless-mode logger. Writes structured JSON lines to stderr so stdout
 * stays clean for JSON-RPC frames.
 *
 * Also intercepts console.log/warn/error to prevent dependencies (notably
 * the chat loop's verbose logging) from polluting stdout.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let minLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[minLevel]) return;
  const frame = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {}),
  };
  process.stderr.write(`${JSON.stringify(frame)}\n`);
}

/**
 * Redirect console.* to stderr so stray logs never land in stdout (which
 * is reserved for JSON-RPC frames). Call this once during headless boot.
 */
export function interceptConsole(): void {
  const write = (level: LogLevel, args: unknown[]) => {
    const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    log(level, message);
  };
  console.log = (...args: unknown[]) => write('info', args);
  console.info = (...args: unknown[]) => write('info', args);
  console.warn = (...args: unknown[]) => write('warn', args);
  console.error = (...args: unknown[]) => write('error', args);
  console.debug = (...args: unknown[]) => write('debug', args);
}
