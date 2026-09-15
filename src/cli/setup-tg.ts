// ============================================================
// cli/setup-tg.ts — Telegram login wizard
// Connects via MTProto and gets a session string
// ============================================================

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
const input = require('input');
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { loadConfig } from '../config';
import { logger, initLogger } from '../logger';

export async function runTelegramSetup(): Promise<void> {
  const config = loadConfig();
  initLogger(config.logLevel);

  logger.banner('Telegram Setup Wizard');

  const { apiId, apiHash } = config.telegram;

  if (!apiId || !apiHash) {
    console.log(chalk.red('❌ Error: TG_API_ID and TG_API_HASH are not set in .env'));
    console.log(chalk.yellow('Please get them from https://my.telegram.org and add them to .env before running this setup.'));
    process.exit(1);
  }

  console.log(chalk.cyan('Starting Telegram login...'));
  
  const stringSession = new StringSession(''); // Empty for new session
  
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    await client.start({
      phoneNumber: async () => await input.text('Please enter your phone number (with country code, e.g. +1234567890): '),
      password: async () => await input.text('Please enter your 2FA password (leave empty if not set): '),
      phoneCode: async () => await input.text('Please enter the code you received on Telegram: '),
      onError: (err: Error) => console.log(chalk.red(`Error: ${err.message}`)),
    });

    console.log(chalk.green('✅ Successfully logged in!'));
    
    // Get the session string
    const sessionString = client.session.save() as unknown as string;
    
    // Save to .env
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      if (envContent.includes('TG_SESSION=')) {
        envContent = envContent.replace(/TG_SESSION=.*/, `TG_SESSION=${sessionString}`);
      } else {
        envContent += `\nTG_SESSION=${sessionString}\n`;
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log(chalk.green('✅ Saved TG_SESSION to .env file!'));
    } else {
      console.log(chalk.yellow('⚠️ Could not find .env file. Please add this session string manually:'));
      console.log(chalk.dim('TG_SESSION=' + sessionString));
    }

    await client.disconnect();
    
    console.log('');
    console.log(chalk.green('Telegram setup complete. You can now use the Telegram source.'));
  } catch (err: any) {
    console.log(chalk.red(`❌ Setup failed: ${err.message}`));
  }
}
