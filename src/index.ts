// ============================================================
// index.ts — Main entry point for Promocode Automation System
// CLI powered by Commander: start, worker, setup, test
// ============================================================

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, getAssignedAccounts } from './config';
import { initLogger, logger } from './logger';
import { loadDedupStore } from './dedup';
import { processCode, processCodeBatch } from './worker/pool';
import { startServer, broadcastCode, hasWorkers, workerCount, stopServer } from './network/server';
import { connectToController, disconnect } from './network/client';
import { createCliSource } from './sources/cli';
import { createTelegramSource } from './sources/telegram';
import { runSetup } from './cli/setup';
import { runTestCode } from './cli/test-code';
import { runTelegramSetup } from './cli/setup-tg';

const program = new Command();

program
  .name('promo-automation')
  .description('20-Account Promocode Automation System')
  .version('1.0.0');

// ═══════════════════════════════════════════════════════════════
// Command: start — Run as Controller (Laptop 1)
// ═══════════════════════════════════════════════════════════════
program
  .command('start')
  .description('Start the controller node (Laptop 1) — processes codes and coordinates workers')
  .option('--no-ws', 'Disable WebSocket server (single-machine mode)')
  .action(async (opts) => {
    const config = loadConfig();
    initLogger(config.logLevel);
    loadDedupStore();

    logger.banner('Promocode Automation — Controller');
    console.log(chalk.dim(`  Website:     ${config.websiteUrl}`));
    console.log(chalk.dim(`  Accounts:    ${config.accountRange.start}-${config.accountRange.end}`));
    console.log(chalk.dim(`  Concurrency: ${config.maxConcurrency}`));
    console.log(chalk.dim(`  TEST_MODE:   ${config.testMode}`));
    console.log('');

    const accounts = getAssignedAccounts(config);
    logger.info('Main', `Loaded ${accounts.length} enabled accounts`);

    // ── Start WebSocket server for workers ──
    if (opts.ws !== false) {
      startServer(config);
      logger.info('Main', 'WebSocket server started — workers can connect');
    } else {
      logger.info('Main', 'Single-machine mode — no WebSocket server');
    }

    // ── Initialize Telegram Source ──
    const tgSource = createTelegramSource(config);
    if (config.telegram.apiId && config.telegram.session) {
      await tgSource.start();
      
      // Hook up the Telegram code received event
      tgSource.onCode(async (codes) => {
        for (const code of codes) {
          logger.info('Main', `Processing code from Telegram: ${code}`);
          const localReport = await processCode(code, config);

          if (opts.ws !== false && hasWorkers()) {
            logger.info('Main', `Broadcasting ${code} to ${workerCount()} worker(s)`);
            const remoteResults = await broadcastCode(code);
            logger.info('Main', `Received ${remoteResults.length} remote results`);

            const allResults = [...localReport.results, ...remoteResults];
            const totalSuccess = allResults.filter(r => r.status === 'SUCCESS').length;
            const totalAccounts = allResults.length;
            console.log('');
            console.log(chalk.bold.cyan(`  🌐 Combined Results (local + remote):`));
            console.log(chalk.green(`     ✅ Success: ${totalSuccess}/${totalAccounts}`));
            logger.separator();
          }
        }
      });
    }

    // ── Interactive CLI loop ──
    const cli = createCliSource();
    logger.info('Main', 'Ready to accept promo codes from CLI or Telegram');

    while (true) {
      const codes = await cli.getNextCodes();
      if (codes === null) {
        logger.info('Main', 'Quit signal received');
        break;
      }

      for (const code of codes) {
        // Process locally on assigned accounts
        const localReport = await processCode(code, config);

        // Also broadcast to connected workers
        if (opts.ws !== false && hasWorkers()) {
          logger.info('Main', `Broadcasting ${code} to ${workerCount()} worker(s)`);
          const remoteResults = await broadcastCode(code);
          logger.info('Main', `Received ${remoteResults.length} remote results`);

          // Merge results for display
          const allResults = [...localReport.results, ...remoteResults];
          const totalSuccess = allResults.filter(r => r.status === 'SUCCESS').length;
          const totalAccounts = allResults.length;
          console.log('');
          console.log(chalk.bold.cyan(`  🌐 Combined Results (local + remote):`));
          console.log(chalk.green(`     ✅ Success: ${totalSuccess}/${totalAccounts}`));
          logger.separator();
        }
      }
    }

    // ── Cleanup ──
    cli.close();
    await tgSource.stop();
    if (opts.ws !== false) {
      stopServer();
    }
    logger.info('Main', 'Shutting down...');
    logger.close();
    process.exit(0);
  });

// ═══════════════════════════════════════════════════════════════
// Command: worker — Run as Worker (Laptop 2)
// ═══════════════════════════════════════════════════════════════
program
  .command('worker')
  .description('Start as a worker node (Laptop 2) — connects to controller and processes codes')
  .action(async () => {
    const config = loadConfig();
    initLogger(config.logLevel);
    loadDedupStore();

    logger.banner('Promocode Automation — Worker Node');
    console.log(chalk.dim(`  Controller:  ${config.ws.controllerUrl || 'NOT SET'}`));
    console.log(chalk.dim(`  Accounts:    ${config.accountRange.start}-${config.accountRange.end}`));
    console.log(chalk.dim(`  Concurrency: ${config.maxConcurrency}`));
    console.log('');

    if (!config.ws.controllerUrl) {
      logger.error('Main', 'WS_CONTROLLER_URL is not set in .env');
      logger.error('Main', 'Set it to ws://<controller-ip>:9600');
      process.exit(1);
    }

    const accounts = getAssignedAccounts(config);
    logger.info('Main', `Loaded ${accounts.length} enabled accounts`);

    // Connect to controller
    connectToController(config);

    // Keep alive
    logger.info('Main', 'Worker is running — waiting for codes from controller');
    logger.info('Main', 'Press Ctrl+C to stop');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Main', 'Shutting down worker...');
      disconnect();
      logger.close();
      process.exit(0);
    });
  });

// ═══════════════════════════════════════════════════════════════
// Command: setup — Account Setup Wizard
// ═══════════════════════════════════════════════════════════════
program
  .command('setup')
  .description('Open browsers to manually log into each account')
  .action(async () => {
    await runSetup();
  });

// ═══════════════════════════════════════════════════════════════
// Command: setup-tg — Telegram Setup Wizard
// ═══════════════════════════════════════════════════════════════
program
  .command('setup-tg')
  .description('Log into Telegram to get a session string for automatic promo code extraction')
  .action(async () => {
    await runTelegramSetup();
  });

// ═══════════════════════════════════════════════════════════════
// Command: test — Quick Single-Account Test
// ═══════════════════════════════════════════════════════════════
program
  .command('test')
  .description('Test a single promo code on one account to verify flow')
  .argument('[code]', 'The promo code to test (optional, will prompt if not provided)')
  .action(async (code?: string) => {
    await runTestCode(code);
  });

// ═══════════════════════════════════════════════════════════════
// Parse and execute
// ═══════════════════════════════════════════════════════════════
program.parse(process.argv);
