// ============================================================
// browser/context.ts — Playwright persistent context manager
// Launches Chromium with saved user profile (no password storage)
// ============================================================

import { chromium, BrowserContext } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { AppConfig, AccountConfig } from '../types';
import { resolveProfileDir } from '../config';
import { logger } from '../logger';

/**
 * Launch a persistent browser context for an account.
 * The profile directory stores cookies, localStorage, etc.
 * User logs in once via `npm run setup`, and the session persists.
 */
export async function launchContext(
  account: AccountConfig,
  config: AppConfig
): Promise<BrowserContext> {
  const profileDir = resolveProfileDir(account);

  // Ensure profile directory exists
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
    logger.info('Browser', `Created profile directory: ${profileDir}`);
  }

  logger.info('Browser', `Launching browser for ${account.id} (${account.label})`);
  logger.debug('Browser', `Profile: ${profileDir}`);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: config.headless,
    slowMo: config.slowMo,
    viewport: config.settings.browser.viewport,
    locale: config.settings.browser.locale,
    ...(config.settings.browser.userAgent
      ? { userAgent: config.settings.browser.userAgent }
      : {}),
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  logger.success('Browser', `Context ready for ${account.id}`);
  return context;
}

/**
 * Safely close a browser context.
 */
export async function closeContext(
  context: BrowserContext | null,
  accountId: string
): Promise<void> {
  if (context) {
    try {
      await context.close();
      logger.info('Browser', `Closed context for ${accountId}`);
    } catch (err: any) {
      logger.warn('Browser', `Error closing context for ${accountId}: ${err.message}`);
    }
  }
}

/**
 * Check if an account's profile directory has saved session data.
 */
export function hasSession(account: AccountConfig): boolean {
  const profileDir = resolveProfileDir(account);
  if (!fs.existsSync(profileDir)) return false;
  
  // Check for key Chromium profile files that indicate a real session
  const markers = ['Default', 'Cookies', 'Local State'];
  return markers.some(marker => 
    fs.existsSync(path.join(profileDir, marker))
  );
}
