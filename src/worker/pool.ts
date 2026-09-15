// ============================================================
// worker/pool.ts — Concurrent worker pool
// Distributes promo codes across accounts with bounded concurrency
// ============================================================

import { AppConfig, AccountConfig, PromoResult, CodeReport } from '../types';
import { getAssignedAccounts } from '../config';
import { runCodeOnAccount } from './runner';
import { logger } from '../logger';
import chalk from 'chalk';

/**
 * Process a single promo code across all assigned accounts.
 * Uses bounded concurrency (config.maxConcurrency) to avoid overload.
 */
export async function processCode(
  code: string,
  config: AppConfig
): Promise<CodeReport> {
  const accounts = getAssignedAccounts(config);
  const report: CodeReport = {
    code,
    totalAccounts: accounts.length,
    processed: 0,
    results: [],
    startTime: Date.now(),
  };

  logger.separator();
  logger.banner(`Processing: ${code}`);
  logger.info('Pool', `Distributing to ${accounts.length} accounts (concurrency: ${config.maxConcurrency})`);

  // ── Process in bounded-concurrency batches ──
  const batches = chunkArray(accounts, config.maxConcurrency);

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    logger.info('Pool', `Batch ${batchIdx + 1}/${batches.length}: ${batch.map(a => a.id).join(', ')}`);

    const batchPromises = batch.map(account =>
      runCodeOnAccount(code, account, config)
    );

    const batchResults = await Promise.allSettled(batchPromises);

    for (const settled of batchResults) {
      if (settled.status === 'fulfilled') {
        report.results.push(settled.value);
        report.processed++;
      } else {
        logger.error('Pool', `Unexpected rejection: ${settled.reason}`);
      }
    }
  }

  report.endTime = Date.now();

  // ── Print summary ──
  printCodeSummary(report);

  return report;
}

/**
 * Process multiple promo codes sequentially.
 * Each code is distributed across all accounts before moving to the next.
 */
export async function processCodeBatch(
  codes: string[],
  config: AppConfig
): Promise<CodeReport[]> {
  const reports: CodeReport[] = [];

  logger.banner(`Batch: ${codes.length} codes to process`);

  for (let i = 0; i < codes.length; i++) {
    logger.info('Pool', `Code ${i + 1}/${codes.length}: ${codes[i]}`);
    const report = await processCode(codes[i], config);
    reports.push(report);
  }

  // ── Final summary ──
  printBatchSummary(reports);
  return reports;
}

/**
 * Split an array into chunks of a given size.
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Print a summary for a single code's results.
 */
function printCodeSummary(report: CodeReport): void {
  const duration = report.endTime ? report.endTime - report.startTime : 0;
  const success = report.results.filter(r => r.status === 'SUCCESS').length;
  const failed = report.results.filter(r => !['SUCCESS', 'ALREADY_REDEEMED'].includes(r.status)).length;
  const skipped = report.results.filter(r => r.status === 'ALREADY_REDEEMED').length;

  console.log('');
  logger.separator();
  console.log(chalk.bold(`  📊 Results for: ${report.code}`));
  console.log(chalk.green(`  ✅ Success:  ${success}`));
  console.log(chalk.yellow(`  ⏭️  Skipped:  ${skipped} (already redeemed/dedup)`));
  console.log(chalk.red(`  ❌ Failed:   ${failed}`));
  console.log(chalk.dim(`  ⏱️  Duration: ${(duration / 1000).toFixed(1)}s`));
  logger.separator();
  console.log('');
}

/**
 * Print a summary for an entire batch of codes.
 */
function printBatchSummary(reports: CodeReport[]): void {
  const totalCodes = reports.length;
  const totalAttempts = reports.reduce((sum, r) => sum + r.results.length, 0);
  const totalSuccess = reports.reduce(
    (sum, r) => sum + r.results.filter(res => res.status === 'SUCCESS').length,
    0
  );

  console.log('');
  logger.banner('Batch Complete');
  console.log(chalk.bold(`  Total codes:    ${totalCodes}`));
  console.log(chalk.bold(`  Total attempts: ${totalAttempts}`));
  console.log(chalk.green.bold(`  Total success:  ${totalSuccess}`));
  logger.separator();
}
