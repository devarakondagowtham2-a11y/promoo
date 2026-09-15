// ============================================================
// config.ts — Configuration loader with TEST_MODE safety gate
// ============================================================

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { AppConfig, AccountConfig, SettingsConfig } from './types';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const ROOT = process.cwd();

function loadJson<T>(filePath: string): T {
  const absolute = path.resolve(ROOT, filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Config file not found: ${absolute}`);
  }
  return JSON.parse(fs.readFileSync(absolute, 'utf-8'));
}

function envBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val.toLowerCase() === 'true' || val === '1';
}

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
}

function envStr(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

/**
 * Load and validate the full application config.
 * Enforces the TEST_MODE safety gate.
 */
export function loadConfig(): AppConfig {
  // ── Safety Gate ──
  const testMode = envBool('TEST_MODE', false);
  if (!testMode) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════╗');
    console.error('║  ⛔ SAFETY GATE: TEST_MODE is not enabled!              ║');
    console.error('║  Set TEST_MODE=true in .env to allow execution.         ║');
    console.error('║  This prevents accidental production runs.              ║');
    console.error('╚══════════════════════════════════════════════════════════╝');
    console.error('');
    process.exit(1);
  }

  // ── Load JSON configs ──
  const accountsData = loadJson<{ accounts: AccountConfig[] }>('config/accounts.json');
  const settings = loadJson<SettingsConfig>('config/settings.json');

  // ── Build AppConfig ──
  const config: AppConfig = {
    testMode,
    websiteUrl: envStr('WEBSITE_URL', 'https://o96.app/?utm_ref=1887984572'),
    nodeRole: envStr('NODE_ROLE', 'controller') as 'controller' | 'worker',
    ws: {
      port: envInt('WS_PORT', 9600),
      host: envStr('WS_HOST', '0.0.0.0'),
      authToken: envStr('WS_AUTH_TOKEN', 'change-me'),
      controllerUrl: process.env.WS_CONTROLLER_URL,
    },
    telegram: {
      apiId: envInt('TG_API_ID', 0),
      apiHash: envStr('TG_API_HASH', ''),
      channel: envStr('TG_CHANNEL', ''),
      session: envStr('TG_SESSION', ''),
    },
    maxConcurrency: Math.min(envInt('MAX_CONCURRENCY', 5), 10),
    accountRange: {
      start: envInt('ACCOUNT_RANGE_START', 1),
      end: envInt('ACCOUNT_RANGE_END', 10),
    },
    headless: envBool('HEADLESS', false),
    slowMo: envInt('SLOW_MO', 50),
    logLevel: envStr('LOG_LEVEL', 'info'),
    accounts: accountsData.accounts,
    settings,
  };

  // ── Validate ──
  if (config.accountRange.start < 1 || config.accountRange.end > config.accounts.length) {
    throw new Error(
      `Account range ${config.accountRange.start}-${config.accountRange.end} ` +
      `is out of bounds (1-${config.accounts.length})`
    );
  }

  if (config.accountRange.start > config.accountRange.end) {
    throw new Error(
      `Account range start (${config.accountRange.start}) must be <= end (${config.accountRange.end})`
    );
  }

  return config;
}

/**
 * Get accounts assigned to this machine based on the configured range.
 */
export function getAssignedAccounts(config: AppConfig): AccountConfig[] {
  return config.accounts
    .slice(config.accountRange.start - 1, config.accountRange.end)
    .filter(acc => acc.enabled);
}

/**
 * Resolve the absolute profile directory path for an account.
 */
export function resolveProfileDir(account: AccountConfig): string {
  return path.resolve(ROOT, account.profileDir);
}
