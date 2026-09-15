// ============================================================
// types.ts — Core type definitions for the Promocode Automation System
// ============================================================

/** Result classification for a promo code redemption attempt */
export enum RedeemStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  INVALID_CODE = 'INVALID_CODE',
  ALREADY_REDEEMED = 'ALREADY_REDEEMED',
  EXPIRED = 'EXPIRED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

/** Single promo code redemption result */
export interface PromoResult {
  code: string;
  accountId: string;
  status: RedeemStatus;
  message: string;
  rawResponse?: string;
  timestamp: number;
  durationMs: number;
  attempt: number;
}

/** Account configuration from config/accounts.json */
export interface AccountConfig {
  id: string;
  label: string;
  profileDir: string;
  enabled: boolean;
}

/** Settings from config/settings.json */
export interface SettingsConfig {
  selectors: {
    promoExpander: string;
    promoInput: string;
    confirmButton: string;
  };
  navigation: {
    timeout: number;
    waitAfterNavigate: number;
    waitAfterSubmit: number;
  };
  results: {
    successPatterns: string[];
    alreadyRedeemedPatterns: string[];
    invalidPatterns: string[];
    expiredPatterns: string[];
  };
  retry: {
    maxAttempts: number;
    delayMs: number;
  };
  browser: {
    viewport: { width: number; height: number };
    userAgent: string | null;
    locale: string;
  };
  telegram: {
    extractRegex: string;
  };
}

/** Complete application configuration */
export interface AppConfig {
  testMode: boolean;
  websiteUrl: string;
  nodeRole: 'controller' | 'worker';
  ws: {
    port: number;
    host: string;
    authToken: string;
    controllerUrl?: string;
  };
  telegram: {
    apiId: number;
    apiHash: string;
    channel: string;
    session: string;
  };
  maxConcurrency: number;
  accountRange: {
    start: number;
    end: number;
  };
  headless: boolean;
  slowMo: number;
  logLevel: string;
  accounts: AccountConfig[];
  settings: SettingsConfig;
}

/** WebSocket message types */
export enum WSMessageType {
  AUTH = 'AUTH',
  AUTH_OK = 'AUTH_OK',
  AUTH_FAIL = 'AUTH_FAIL',
  PROMO_CODE = 'PROMO_CODE',
  PROMO_RESULT = 'PROMO_RESULT',
  PROMO_BATCH_RESULT = 'PROMO_BATCH_RESULT',
  PING = 'PING',
  PONG = 'PONG',
  STATUS = 'STATUS',
  SHUTDOWN = 'SHUTDOWN',
}

/** WebSocket message envelope */
export interface WSMessage {
  type: WSMessageType;
  payload: any;
  timestamp: number;
  id: string;
}

/** Aggregated results for a single promo code across all accounts */
export interface CodeReport {
  code: string;
  totalAccounts: number;
  processed: number;
  results: PromoResult[];
  startTime: number;
  endTime?: number;
}

/** Worker status info */
export interface WorkerStatus {
  nodeRole: string;
  accountRange: { start: number; end: number };
  activeJobs: number;
  totalProcessed: number;
  connected: boolean;
}
