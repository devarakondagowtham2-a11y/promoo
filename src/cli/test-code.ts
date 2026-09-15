// ============================================================
// cli/test-code.ts — Quick single-account test
// Tests one promo code on one account to verify flow + selectors
// ============================================================

import * as readline from 'readline';
import chalk from 'chalk';
import { loadConfig, getAssignedAccounts } from '../config';
import { logger, initLogger } from '../logger';
import { launchContext, closeContext } from '../browser/context';
import { redeemCode } from '../browser/promo';
import { RedeemStatus } from '../types';

/**
 * Quick test: redeem a single code on the first enabled account.
 * Used to verify selectors and flow before running the full system.
 */
export async function runTestCode(codeArg?: string): Promise<void> {
  const config = loadConfig();
  initLogger(config.logLevel);

  logger.banner('Test Mode — Single Account');

  const accounts = getAssignedAccounts(config);
  if (accounts.length === 0) {
    logger.error('Test', 'No enabled accounts found in the configured range');
    process.exit(1);
  }

  const account = accounts[0];
  logger.info('Test', `Using account: ${account.label} (${account.id})`);

  // Get code from argument or prompt
  let code = codeArg;
  if (!code) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    code = await new Promise<string>((resolve) => {
      rl.question(chalk.cyan('  Enter a test promo code: '), (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  if (!code) {
    logger.error('Test', 'No code provided');
    process.exit(1);
  }

  logger.info('Test', `Testing code: ${code}`);
  logger.info('Test', `Target URL: ${config.websiteUrl}`);
  logger.separator();

  // Launch browser and try the code
  let context = null;
  try {
    context = await launchContext(account, config);
    const result = await redeemCode(context, code, account.id, config);

    console.log('');
    logger.separator();
    console.log(chalk.bold('  📊 Test Result:'));
    console.log(`  Code:     ${result.code}`);
    console.log(`  Account:  ${result.accountId}`);
    console.log(`  Status:   ${colorStatus(result.status)}`);
    console.log(`  Message:  ${result.message}`);
    console.log(`  Duration: ${result.durationMs}ms`);
    console.log(`  Attempt:  ${result.attempt}`);
    logger.separator();

    if (result.status === RedeemStatus.UNKNOWN) {
      console.log('');
      console.log(chalk.yellow('  ⚠️  Status was UNKNOWN — you may need to update'));
      console.log(chalk.yellow('     the result patterns in config/settings.json'));
      if (result.rawResponse) {
        console.log(chalk.dim('  Raw response snippet:'));
        console.log(chalk.dim('  ' + result.rawResponse.substring(0, 500)));
      }
    }

  } catch (err: any) {
    logger.error('Test', `Test failed: ${err.message}`);
  } finally {
    await closeContext(context, account.id);
  }

  console.log('');
  logger.close();
}

function colorStatus(status: RedeemStatus): string {
  switch (status) {
    case RedeemStatus.SUCCESS: return chalk.bold.green(status);
    case RedeemStatus.ALREADY_REDEEMED: return chalk.yellow(status);
    case RedeemStatus.INVALID_CODE: return chalk.red(status);
    case RedeemStatus.EXPIRED: return chalk.red(status);
    case RedeemStatus.NETWORK_ERROR: return chalk.bgRed.white(status);
    case RedeemStatus.TIMEOUT: return chalk.bgYellow.black(status);
    default: return chalk.gray(status);
  }
}
