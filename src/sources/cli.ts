// ============================================================
// sources/cli.ts — Interactive CLI input for promo codes
// Supports single codes, comma-separated batches, and quit
// ============================================================

import * as readline from 'readline';
import chalk from 'chalk';
import { logger } from '../logger';

/**
 * Prompt the user for promo codes interactively.
 * Returns a promise that resolves with an array of codes.
 * 
 * Commands:
 *   - Enter a code (or multiple comma-separated) to process
 *   - "q" or "quit" or "exit" to stop
 *   - "status" to show current stats
 */
export function createCliSource(): {
  getNextCodes: () => Promise<string[] | null>;
  close: () => void;
} {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let closed = false;

  const getNextCodes = (): Promise<string[] | null> => {
    if (closed) return Promise.resolve(null);

    return new Promise((resolve) => {
      console.log('');
      rl.question(
        chalk.bold.cyan('  🎟️  Enter promo code(s) (comma-separated, or "q" to quit): '),
        (answer: string) => {
          const trimmed = answer.trim();

          if (!trimmed || ['q', 'quit', 'exit'].includes(trimmed.toLowerCase())) {
            resolve(null);
            return;
          }

          // Parse comma-separated codes
          const codes = trimmed
            .split(',')
            .map(c => c.trim())
            .filter(c => c.length > 0);

          if (codes.length === 0) {
            logger.warn('CLI', 'No valid codes entered');
            resolve(getNextCodes()); // Re-prompt
            return;
          }

          logger.info('CLI', `Received ${codes.length} code(s): ${codes.join(', ')}`);
          resolve(codes);
        }
      );
    });
  };

  const close = () => {
    closed = true;
    rl.close();
  };

  return { getNextCodes, close };
}
