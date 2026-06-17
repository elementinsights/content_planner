/**
 * Minimal structured logger. Writes leveled, optionally-JSON lines to stderr so
 * stdout stays clean for piped data. Level controlled by SEO_LOG_LEVEL.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel(): LogLevel {
  const l = (process.env.SEO_LOG_LEVEL ?? 'info').toLowerCase();
  return (['debug', 'info', 'warn', 'error'].includes(l) ? l : 'info') as LogLevel;
}

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';

function emit(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[currentLevel()]) return;
  const json = (process.env.SEO_LOG_JSON ?? '').toLowerCase() === 'true';
  if (json) {
    process.stderr.write(
      JSON.stringify({ level, msg, ...fields }) + '\n',
    );
    return;
  }
  const color = process.stderr.isTTY ? COLORS[level] : '';
  const reset = process.stderr.isTTY ? RESET : '';
  const tag = `${color}[${level.toUpperCase()}]${reset}`;
  const extra = fields && Object.keys(fields).length ? ' ' + JSON.stringify(fields) : '';
  process.stderr.write(`${tag} ${msg}${extra}\n`);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
  /** A user-facing step banner (always shown unless level=error). */
  step: (msg: string) => emit('info', `\x1b[1m▶ ${msg}\x1b[0m`),
};
