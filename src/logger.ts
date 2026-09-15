// ============================================================
// logger.ts — Structured logging with chalk colors + file output
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

const ROOT = process.cwd();
const LOGS_DIR = path.resolve(ROOT, 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  success: 1,
};

const LEVEL_COLORS: Record<LogLevel, (text: string) => string> = {
  debug: chalk.gray,
  info: chalk.cyan,
  warn: chalk.yellow,
  error: chalk.red,
  success: chalk.green,
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: '🔍 DEBUG',
  info: 'ℹ️  INFO ',
  warn: '⚠️  WARN ',
  error: '❌ ERROR',
  success: '✅ OK   ',
};

let globalLogLevel: LogLevel = 'info';
let logStream: fs.WriteStream | null = null;

/**
 * Initialize the logger with a session-specific log file.
 */
export function initLogger(level: string = 'info'): void {
  globalLogLevel = level as LogLevel;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(LOGS_DIR, `session_${timestamp}.log`);
  logStream = fs.createWriteStream(logFile, { flags: 'a' });
  log('info', 'Logger', `Session log: ${logFile}`);
}

function formatTime(): string {
  return new Date().toISOString().substring(11, 23);
}

/**
 * Core log function.
 */
export function log(level: LogLevel, context: string, message: string, data?: any): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[globalLogLevel]) return;

  const time = formatTime();
  const colorFn = LEVEL_COLORS[level];
  const label = LEVEL_LABELS[level];
  const ctx = chalk.magenta(`[${context}]`);

  // Console output
  const consoleLine = `${chalk.dim(time)} ${colorFn(label)} ${ctx} ${message}`;
  if (level === 'error') {
    console.error(consoleLine);
  } else {
    console.log(consoleLine);
  }
  if (data) {
    console.log(chalk.dim('  └─'), JSON.stringify(data, null, 2));
  }

  // File output (plain, no ANSI)
  if (logStream) {
    const fileLine = `${time} ${label.replace(/[^\w\s]/g, '').trim()} [${context}] ${message}`;
    logStream.write(fileLine + '\n');
    if (data) {
      logStream.write('  ' + JSON.stringify(data) + '\n');
    }
  }
}

/** Convenience log shortcuts */
export const logger = {
  debug: (ctx: string, msg: string, data?: any) => log('debug', ctx, msg, data),
  info: (ctx: string, msg: string, data?: any) => log('info', ctx, msg, data),
  warn: (ctx: string, msg: string, data?: any) => log('warn', ctx, msg, data),
  error: (ctx: string, msg: string, data?: any) => log('error', ctx, msg, data),
  success: (ctx: string, msg: string, data?: any) => log('success', ctx, msg, data),

  /** Log a promo result with appropriate level */
  promoResult: (accountId: string, code: string, status: string, message: string) => {
    const level: LogLevel = status === 'SUCCESS' ? 'success' : status.includes('ERROR') ? 'error' : 'warn';
    log(level, accountId, `[${code}] → ${status}: ${message}`);
  },

  /** Print a separator line */
  separator: () => {
    console.log(chalk.dim('─'.repeat(70)));
  },

  /** Print a banner */
  banner: (text: string) => {
    console.log('');
    console.log(chalk.bold.cyan('╔' + '═'.repeat(text.length + 2) + '╗'));
    console.log(chalk.bold.cyan('║ ') + chalk.bold.white(text) + chalk.bold.cyan(' ║'));
    console.log(chalk.bold.cyan('╚' + '═'.repeat(text.length + 2) + '╝'));
    console.log('');
  },

  /** Close the file stream */
  close: () => {
    if (logStream) {
      logStream.end();
      logStream = null;
    }
  },
};
