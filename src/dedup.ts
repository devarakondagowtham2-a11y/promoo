// ============================================================
// dedup.ts — Atomic deduplication engine
// Prevents re-processing the same code+account combination
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

const ROOT = process.cwd();
const DEDUP_FILE = path.resolve(ROOT, 'data', 'processed_codes.json');

interface DedupStore {
  [key: string]: number; // "CODE::ACCOUNT_ID" → timestamp
}

let store: DedupStore = {};

/**
 * Generate a dedup key for a code+account combination.
 */
function makeKey(code: string, accountId: string): string {
  return `${code.toUpperCase().trim()}::${accountId}`;
}

/**
 * Load the dedup store from disk.
 */
export function loadDedupStore(): void {
  try {
    if (fs.existsSync(DEDUP_FILE)) {
      const raw = fs.readFileSync(DEDUP_FILE, 'utf-8');
      store = JSON.parse(raw);
      const count = Object.keys(store).length;
      logger.info('Dedup', `Loaded ${count} processed entries`);
    } else {
      store = {};
      saveDedupStore();
      logger.info('Dedup', 'Initialized empty dedup store');
    }
  } catch (err: any) {
    logger.error('Dedup', `Failed to load dedup store: ${err.message}`);
    store = {};
  }
}

/**
 * Save the dedup store to disk atomically.
 * Writes to a temp file first, then renames to prevent corruption.
 */
export function saveDedupStore(): void {
  try {
    const dir = path.dirname(DEDUP_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpFile = DEDUP_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DEDUP_FILE);
  } catch (err: any) {
    logger.error('Dedup', `Failed to save dedup store: ${err.message}`);
  }
}

/**
 * Check if a code+account combo has already been processed.
 */
export function isProcessed(code: string, accountId: string): boolean {
  return makeKey(code, accountId) in store;
}

/**
 * Mark a code+account combo as processed.
 * Saves atomically to disk immediately.
 */
export function markProcessed(code: string, accountId: string): void {
  const key = makeKey(code, accountId);
  store[key] = Date.now();
  saveDedupStore();
  logger.debug('Dedup', `Marked as processed: ${key}`);
}

/**
 * Get all codes that have been processed for a given account.
 */
export function getProcessedCodes(accountId: string): string[] {
  return Object.keys(store)
    .filter(key => key.endsWith(`::${accountId}`))
    .map(key => key.split('::')[0]);
}

/**
 * Get total number of processed entries.
 */
export function getProcessedCount(): number {
  return Object.keys(store).length;
}

/**
 * Clear all dedup entries (use with caution).
 */
export function clearDedupStore(): void {
  store = {};
  saveDedupStore();
  logger.warn('Dedup', 'Cleared all dedup entries');
}
