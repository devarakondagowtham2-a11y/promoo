// ============================================================
// cli/setup.ts — Account setup wizard
// Opens headed browser for each account to manually log in
// ============================================================

import { chromium } from 'playwright';
import * as readline from 'readline';
import * as fs from 'fs';
import chalk from 'chalk';
import { loadConfig, getAssignedAccounts, resolveProfileDir } from '../config';
import { logger, initLogger } from '../logger';
import { AccountConfig, AppConfig } from '../types';

/**
 * Run the setup wizard: for each account in the assigned range,
 * open a headed browser so the user can log in manually.
 * The session cookies are saved to the persistent profile directory.
 */
export async function runSetup(): Promise<void> {
  const config = loadConfig();
  initLogger(config.logLevel);

  logger.banner('Account Setup Wizard');

  const accounts = getAssignedAccounts(config);
  logger.info('Setup', `Setting up ${accounts.length} accounts (range ${config.accountRange.start}-${config.accountRange.end})`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    console.log('');
    logger.separator();
    console.log(chalk.bold.yellow(`  📱 Account ${i + 1}/${accounts.length}: ${account.label} (${account.id})`));
    logger.separator();

    const profileDir = resolveProfileDir(account);
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    // Ask user if they want to set up this account
    const shouldSetup = await askQuestion(rl,
      chalk.cyan(`  Set up ${account.label}? (y/n/skip-all): `)
    );

    if (shouldSetup.toLowerCase() === 'skip-all') {
      logger.info('Setup', 'Skipping remaining accounts');
      break;
    }

    if (shouldSetup.toLowerCase() !== 'y') {
      logger.info('Setup', `Skipped ${account.id}`);
      continue;
    }

    // Launch headed browser
    logger.info('Setup', `Opening browser for ${account.id}...`);
    console.log(chalk.dim('  Profile saved to: ' + profileDir));

    const context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      slowMo: 0,
      viewport: config.settings.browser.viewport,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto(config.websiteUrl, { waitUntil: 'domcontentloaded' });

    console.log('');
    console.log(chalk.bold.green('  ✅ Browser is open!'));
    console.log(chalk.yellow('  👉 Log into the account manually.'));
    console.log(chalk.yellow('  👉 Once logged in, come back here and press Enter.'));
    console.log('');

    await askQuestion(rl, chalk.cyan('  Press Enter when done logging in... '));

    // Close browser (session is auto-saved to profileDir)
    await context.close();
    logger.success('Setup', `${account.id} session saved!`);
  }

  rl.close();
  console.log('');
  logger.banner('Setup Complete!');
  console.log(chalk.green('  All configured accounts are ready.'));
  console.log(chalk.dim('  Run "npm run start" to begin processing promo codes.'));
  console.log('');
  logger.close();
}

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}
