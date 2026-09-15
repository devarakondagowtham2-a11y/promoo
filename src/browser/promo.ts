// ============================================================
// browser/promo.ts — Core promo code redemption logic
// Navigates to site, fills promo code, submits, classifies result
// ============================================================

import { BrowserContext, Page } from 'playwright';
import { AppConfig, PromoResult, RedeemStatus, SettingsConfig } from '../types';
import { logger } from '../logger';

/**
 * Attempt to redeem a promo code on the given browser context.
 * 
 * Flow:
 *   1. Navigate to WEBSITE_URL
 *   2. Click "I have a promocode" expander (if visible)
 *   3. Fill the "Enter Promocode" input
 *   4. Click "Confirm" button
 *   5. Wait for response and classify result
 */
export async function redeemCode(
  context: BrowserContext,
  code: string,
  accountId: string,
  config: AppConfig,
  attempt: number = 1
): Promise<PromoResult> {
  const startTime = Date.now();
  const settings = config.settings;
  let page: Page | null = null;

  try {
    // Get the first page or create a new one
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();

    // ── Step 1: Navigate ──
    logger.info(accountId, `Navigating to ${config.websiteUrl}`);
    await page.goto(config.websiteUrl, {
      waitUntil: 'domcontentloaded',
      timeout: settings.navigation.timeout,
    });
    await page.waitForTimeout(settings.navigation.waitAfterNavigate);

    // ── Step 2: Click the "I have a promocode" expander ──
    logger.info(accountId, `Looking for promo expander: "${settings.selectors.promoExpander}"`);
    try {
      const expander = page.getByText(settings.selectors.promoExpander, { exact: false });
      const expanderVisible = await expander.isVisible({ timeout: 5000 }).catch(() => false);
      if (expanderVisible) {
        await expander.click();
        logger.debug(accountId, 'Clicked promo expander');
        await page.waitForTimeout(500);
      } else {
        logger.debug(accountId, 'Promo expander not found or already expanded — continuing');
      }
    } catch {
      logger.debug(accountId, 'Promo section may already be visible — continuing');
    }

    // ── Step 3: Fill the promo code input ──
    logger.info(accountId, `Entering code: ${code}`);
    const input = page.getByPlaceholder(settings.selectors.promoInput);
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.clear();
    await input.fill(code);
    await page.waitForTimeout(300);

    // ── Step 4: Click "Confirm" button ──
    logger.info(accountId, 'Clicking Confirm button');
    const confirmBtn = page.getByRole('button', { name: settings.selectors.confirmButton });
    await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
    await confirmBtn.click();

    // ── Step 5: Wait for result ──
    logger.info(accountId, 'Waiting for result...');
    await page.waitForTimeout(settings.navigation.waitAfterSubmit);

    // Capture the page body text to classify the result
    const bodyText = await page.textContent('body') || '';
    const rawResponse = bodyText.substring(0, 2000); // Cap for logging

    // ── Classify result ──
    const status = classifyResult(bodyText, settings);
    const message = getResultMessage(status, bodyText, settings);

    const result: PromoResult = {
      code,
      accountId,
      status,
      message,
      rawResponse,
      timestamp: Date.now(),
      durationMs: Date.now() - startTime,
      attempt,
    };

    logger.promoResult(accountId, code, status, message);
    return result;

  } catch (err: any) {
    const isTimeout = err.message?.includes('Timeout') || err.name === 'TimeoutError';
    const status = isTimeout ? RedeemStatus.TIMEOUT : RedeemStatus.NETWORK_ERROR;
    
    const result: PromoResult = {
      code,
      accountId,
      status,
      message: err.message || 'Unknown error',
      timestamp: Date.now(),
      durationMs: Date.now() - startTime,
      attempt,
    };

    logger.error(accountId, `[${code}] Error: ${err.message}`);
    return result;
  }
}

/**
 * Classify the result based on page text content.
 */
function classifyResult(bodyText: string, settings: SettingsConfig): RedeemStatus {
  const text = bodyText.toLowerCase();

  // Check patterns in priority order
  for (const pattern of settings.results.successPatterns) {
    if (text.includes(pattern.toLowerCase())) return RedeemStatus.SUCCESS;
  }
  for (const pattern of settings.results.alreadyRedeemedPatterns) {
    if (text.includes(pattern.toLowerCase())) return RedeemStatus.ALREADY_REDEEMED;
  }
  for (const pattern of settings.results.expiredPatterns) {
    if (text.includes(pattern.toLowerCase())) return RedeemStatus.EXPIRED;
  }
  for (const pattern of settings.results.invalidPatterns) {
    if (text.includes(pattern.toLowerCase())) return RedeemStatus.INVALID_CODE;
  }

  return RedeemStatus.UNKNOWN;
}

/**
 * Generate a human-readable message for the result.
 */
function getResultMessage(
  status: RedeemStatus,
  bodyText: string,
  settings: SettingsConfig
): string {
  switch (status) {
    case RedeemStatus.SUCCESS:
      return 'Promo code redeemed successfully';
    case RedeemStatus.ALREADY_REDEEMED:
      return 'Code already redeemed on this account';
    case RedeemStatus.EXPIRED:
      return 'Promo code has expired';
    case RedeemStatus.INVALID_CODE:
      return 'Invalid promo code';
    case RedeemStatus.UNKNOWN:
      // Try to extract a meaningful snippet from the page
      const snippet = extractSnippet(bodyText);
      return snippet ? `Unknown result — page says: "${snippet}"` : 'Unknown result — could not determine outcome';
    default:
      return `Status: ${status}`;
  }
}

/**
 * Extract a short meaningful text snippet from the page body.
 */
function extractSnippet(bodyText: string): string {
  // Look for common result-area text near key words
  const keywords = ['promo', 'code', 'error', 'success', 'bonus', 'invalid'];
  const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 5 && l.length < 200);
  
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return line.substring(0, 150);
      }
    }
  }
  return '';
}
