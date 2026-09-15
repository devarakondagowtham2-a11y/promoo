// ============================================================
// worker/runner.ts — Individual account runner
// Manages single account: browser lifecycle + code redemption
// ============================================================

import { BrowserContext } from 'playwright';
import { AppConfig, AccountConfig, PromoResult, RedeemStatus } from '../types';
import { launchContext, closeContext } from '../browser/context';
import { redeemCode } from '../browser/promo';
import { isProcessed, markProcessed } from '../dedup';
import { logger } from '../logger';

/**
 * Run a single promo code against a single account.
 * Handles: dedup check → browser launch → redemption → retry → cleanup.
 */
export async function runCodeOnAccount(
  code: string,
  account: AccountConfig,
  config: AppConfig
): Promise<PromoResult> {
  // ── Dedup check ──
  if (isProcessed(code, account.id)) {
    logger.info(account.id, `[${code}] Already processed — skipping`);
    return {
      code,
      accountId: account.id,
      status: RedeemStatus.ALREADY_REDEEMED,
      message: 'Skipped (dedup — already processed)',
      timestamp: Date.now(),
      durationMs: 0,
      attempt: 0,
    };
  }

  let context: BrowserContext | null = null;
  let lastResult: PromoResult | null = null;

  try {
    // ── Launch browser ──
    context = await launchContext(account, config);

    // ── Attempt redemption with retries ──
    const maxAttempts = config.settings.retry.maxAttempts;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      logger.info(account.id, `[${code}] Attempt ${attempt}/${maxAttempts}`);

      lastResult = await redeemCode(context, code, account.id, config, attempt);

      // Don't retry on definitive results
      if (isDefinitiveResult(lastResult.status)) {
        break;
      }

      // Retry on transient errors
      if (attempt < maxAttempts) {
        logger.warn(account.id, `[${code}] Got ${lastResult.status}, retrying in ${config.settings.retry.delayMs}ms...`);
        await new Promise(r => setTimeout(r, config.settings.retry.delayMs));
      }
    }

    // ── Mark as processed ──
    if (lastResult) {
      markProcessed(code, account.id);
    }

    return lastResult!;

  } catch (err: any) {
    logger.error(account.id, `[${code}] Fatal error: ${err.message}`);
    return {
      code,
      accountId: account.id,
      status: RedeemStatus.NETWORK_ERROR,
      message: `Fatal: ${err.message}`,
      timestamp: Date.now(),
      durationMs: 0,
      attempt: 0,
    };
  } finally {
    // ── Cleanup ──
    await closeContext(context, account.id);
  }
}

/**
 * Check if a result status is definitive (no retry needed).
 */
function isDefinitiveResult(status: RedeemStatus): boolean {
  return [
    RedeemStatus.SUCCESS,
    RedeemStatus.ALREADY_REDEEMED,
    RedeemStatus.INVALID_CODE,
    RedeemStatus.EXPIRED,
  ].includes(status);
}
