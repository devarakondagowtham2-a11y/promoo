// ============================================================
// sources/telegram.ts — Telegram MTProto source via gramjs
// Monitors a specific channel for promo codes
// ============================================================

import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { AppConfig } from '../types';
import { logger } from '../logger';

export function createTelegramSource(config: AppConfig): {
  start: () => Promise<void>;
  onCode: (callback: (codes: string[]) => void) => void;
  stop: () => Promise<void>;
} {
  const { apiId, apiHash, channel, session } = config.telegram;
  const { extractRegex } = config.settings.telegram;

  if (!apiId || !apiHash || !channel || !session) {
    logger.error('Telegram', 'Missing Telegram configuration. Run "npm run setup-tg" first.');
    return {
      start: async () => {},
      onCode: () => {},
      stop: async () => {},
    };
  }

  const stringSession = new StringSession(session);
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  let codeCallback: ((codes: string[]) => void) | null = null;
  const regex = new RegExp(extractRegex, 'i');

  const handleNewMessage = async (event: NewMessageEvent) => {
    const message = event.message;
    const text = message.text || '';
    
    // Check if the message comes from the target channel
    // We do a loose check here since event.chat might not be fully populated immediately
    // or channel usernames might vary slightly depending on how it was passed.
    // A robust way in gramjs is to check if the sender matches our configured channel.
    let isTargetChannel = false;

    try {
      const chat = await message.getChat();
      if (chat) {
        const username = (chat as any).username;
        const title = (chat as any).title;
        const target = channel.replace('@', '').toLowerCase();
        
        if (
          (username && username.toLowerCase() === target) ||
          (title && title.toLowerCase() === channel.toLowerCase()) ||
          chat.id.toString() === channel
        ) {
          isTargetChannel = true;
        }
      }
    } catch (e) {
      logger.debug('Telegram', 'Failed to fetch chat details for message');
    }

    if (!isTargetChannel) return;

    logger.debug('Telegram', `New message in target channel: ${text.substring(0, 50)}...`);

    const match = text.match(regex);
    if (match && match[1]) {
      const code = match[1].trim().toUpperCase();
      logger.success('Telegram', `Found promo code: ${code}`);
      
      if (codeCallback) {
        codeCallback([code]);
      }
    } else {
      logger.debug('Telegram', 'No promo code matched in the message.');
    }
  };

  return {
    start: async () => {
      try {
        await client.connect();
        logger.info('Telegram', 'Connected to Telegram MTProto');
        
        // Add event handler
        client.addEventHandler(handleNewMessage, new NewMessage({}));
        logger.info('Telegram', `Listening for messages in ${channel}`);
        logger.info('Telegram', `Using extraction regex: ${extractRegex}`);
      } catch (err: any) {
        logger.error('Telegram', `Failed to connect: ${err.message}`);
      }
    },
    
    onCode: (callback: (codes: string[]) => void) => {
      codeCallback = callback;
    },
    
    stop: async () => {
      try {
        await client.disconnect();
        logger.info('Telegram', 'Disconnected from Telegram');
      } catch (err: any) {
        logger.error('Telegram', `Failed to disconnect: ${err.message}`);
      }
    },
  };
}
