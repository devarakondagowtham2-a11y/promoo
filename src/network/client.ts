// ============================================================
// network/client.ts — WebSocket client (Worker / Laptop 2)
// Connects to Controller, receives codes, executes, reports results
// ============================================================

import WebSocket from 'ws';
import { AppConfig, WSMessage, WSMessageType, PromoResult } from '../types';
import { processCode } from '../worker/pool';
import { logger } from '../logger';
import { randomUUID } from 'crypto';

let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
const MAX_RECONNECT_DELAY = 30000;
let reconnectDelay = 1000;

/**
 * Connect to the controller's WebSocket server.
 */
export function connectToController(config: AppConfig): void {
  const url = config.ws.controllerUrl;
  if (!url) {
    logger.error('WS-Client', 'WS_CONTROLLER_URL not set — cannot connect to controller');
    process.exit(1);
  }

  logger.info('WS-Client', `Connecting to controller at ${url}...`);

  ws = new WebSocket(url);

  ws.on('open', () => {
    logger.success('WS-Client', 'Connected to controller');
    reconnectDelay = 1000; // Reset on successful connect

    // Send auth message
    sendMessage(WSMessageType.AUTH, {
      token: config.ws.authToken,
      accountRange: config.accountRange,
    });
    logger.info('WS-Client', 'Sent auth token');
  });

  ws.on('message', async (data: Buffer) => {
    try {
      const msg: WSMessage = JSON.parse(data.toString());
      await handleControllerMessage(msg, config);
    } catch (err: any) {
      logger.error('WS-Client', `Bad message: ${err.message}`);
    }
  });

  ws.on('close', () => {
    logger.warn('WS-Client', 'Disconnected from controller');
    scheduleReconnect(config);
  });

  ws.on('error', (err) => {
    logger.error('WS-Client', `Connection error: ${err.message}`);
  });
}

/**
 * Handle incoming messages from the controller.
 */
async function handleControllerMessage(msg: WSMessage, config: AppConfig): Promise<void> {
  switch (msg.type) {
    case WSMessageType.AUTH_OK:
      logger.success('WS-Client', `Authenticated as worker ${msg.payload?.workerId}`);
      break;

    case WSMessageType.AUTH_FAIL:
      logger.error('WS-Client', `Authentication failed: ${msg.payload?.reason}`);
      process.exit(1);
      break;

    case WSMessageType.PROMO_CODE:
      const code = msg.payload?.code;
      if (!code) {
        logger.warn('WS-Client', 'Received empty promo code');
        return;
      }
      logger.info('WS-Client', `Received code from controller: ${code}`);

      // Process the code locally across assigned accounts
      const report = await processCode(code, config);

      // Send results back to controller
      sendMessage(WSMessageType.PROMO_RESULT, {
        code,
        results: report.results,
        totalAccounts: report.totalAccounts,
        processed: report.processed,
      });
      logger.info('WS-Client', `Sent results for ${code} back to controller`);
      break;

    case WSMessageType.PING:
      sendMessage(WSMessageType.PONG, {});
      break;

    case WSMessageType.SHUTDOWN:
      logger.warn('WS-Client', 'Received shutdown signal from controller');
      disconnect();
      process.exit(0);
      break;

    default:
      logger.warn('WS-Client', `Unknown message type: ${msg.type}`);
  }
}

/**
 * Send a typed message to the controller.
 */
function sendMessage(type: WSMessageType, payload: any): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    logger.warn('WS-Client', 'Cannot send — not connected');
    return;
  }

  const msg: WSMessage = {
    type,
    payload,
    timestamp: Date.now(),
    id: randomUUID(),
  };
  ws.send(JSON.stringify(msg));
}

/**
 * Schedule automatic reconnection with exponential backoff.
 */
function scheduleReconnect(config: AppConfig): void {
  if (reconnectTimer) return;

  logger.info('WS-Client', `Reconnecting in ${reconnectDelay / 1000}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    connectToController(config);
  }, reconnectDelay);
}

/**
 * Disconnect from the controller.
 */
export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  logger.info('WS-Client', 'Disconnected');
}
