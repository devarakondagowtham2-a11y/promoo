// ============================================================
// network/server.ts — WebSocket server (Controller / Laptop 1)
// Authenticates Workers, broadcasts codes, collects remote results
// ============================================================

import { WebSocketServer, WebSocket } from 'ws';
import { AppConfig, WSMessage, WSMessageType, PromoResult, CodeReport } from '../types';
import { logger } from '../logger';
import { randomUUID } from 'crypto';

interface ConnectedWorker {
  ws: WebSocket;
  authenticated: boolean;
  id: string;
  accountRange?: { start: number; end: number };
  pendingResults: Map<string, (results: PromoResult[]) => void>;
}

let wss: WebSocketServer | null = null;
const workers: Map<string, ConnectedWorker> = new Map();

/**
 * Start the WebSocket server on the controller node.
 */
export function startServer(config: AppConfig): void {
  const { port, host, authToken } = config.ws;

  wss = new WebSocketServer({ port, host });

  wss.on('listening', () => {
    logger.success('WS-Server', `Listening on ${host}:${port}`);
    logger.info('WS-Server', 'Waiting for worker connections...');
  });

  wss.on('connection', (ws: WebSocket) => {
    const workerId = randomUUID().substring(0, 8);
    const worker: ConnectedWorker = {
      ws,
      authenticated: false,
      id: workerId,
      pendingResults: new Map(),
    };

    logger.info('WS-Server', `New connection: ${workerId} — awaiting auth`);

    // Auth timeout
    const authTimeout = setTimeout(() => {
      if (!worker.authenticated) {
        logger.warn('WS-Server', `Worker ${workerId} failed to authenticate — disconnecting`);
        ws.close();
      }
    }, 10000);

    ws.on('message', (data: Buffer) => {
      try {
        const msg: WSMessage = JSON.parse(data.toString());
        handleWorkerMessage(worker, msg, authToken);
      } catch (err: any) {
        logger.error('WS-Server', `Bad message from ${workerId}: ${err.message}`);
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      workers.delete(workerId);
      logger.warn('WS-Server', `Worker ${workerId} disconnected`);
    });

    ws.on('error', (err) => {
      logger.error('WS-Server', `Worker ${workerId} error: ${err.message}`);
    });

    workers.set(workerId, worker);
  });

  wss.on('error', (err) => {
    logger.error('WS-Server', `Server error: ${err.message}`);
  });
}

/**
 * Handle incoming messages from a worker.
 */
function handleWorkerMessage(
  worker: ConnectedWorker,
  msg: WSMessage,
  authToken: string
): void {
  switch (msg.type) {
    case WSMessageType.AUTH:
      if (msg.payload?.token === authToken) {
        worker.authenticated = true;
        worker.accountRange = msg.payload?.accountRange;
        sendMessage(worker.ws, WSMessageType.AUTH_OK, { workerId: worker.id });
        logger.success('WS-Server', `Worker ${worker.id} authenticated (accounts ${worker.accountRange?.start}-${worker.accountRange?.end})`);
      } else {
        sendMessage(worker.ws, WSMessageType.AUTH_FAIL, { reason: 'Invalid auth token' });
        logger.error('WS-Server', `Worker ${worker.id} auth failed — bad token`);
        worker.ws.close();
      }
      break;

    case WSMessageType.PROMO_RESULT:
      if (!worker.authenticated) return;
      logger.info('WS-Server', `Result from ${worker.id}: ${msg.payload?.code} → ${msg.payload?.status}`);
      // Resolve pending promise for this code
      const codeKey = msg.payload?.code;
      if (codeKey && worker.pendingResults.has(codeKey)) {
        const resolver = worker.pendingResults.get(codeKey)!;
        resolver(msg.payload?.results || []);
        worker.pendingResults.delete(codeKey);
      }
      break;

    case WSMessageType.PONG:
      logger.debug('WS-Server', `Pong from ${worker.id}`);
      break;

    default:
      logger.warn('WS-Server', `Unknown message type from ${worker.id}: ${msg.type}`);
  }
}

/**
 * Send a promo code to all authenticated workers and wait for results.
 */
export async function broadcastCode(code: string, timeoutMs: number = 120000): Promise<PromoResult[]> {
  const allResults: PromoResult[] = [];
  const promises: Promise<PromoResult[]>[] = [];

  for (const [_, worker] of workers) {
    if (!worker.authenticated) continue;

    const promise = new Promise<PromoResult[]>((resolve) => {
      // Set a per-worker timeout
      const timeout = setTimeout(() => {
        worker.pendingResults.delete(code);
        resolve([]);
        logger.warn('WS-Server', `Timeout waiting for ${worker.id} to process ${code}`);
      }, timeoutMs);

      worker.pendingResults.set(code, (results) => {
        clearTimeout(timeout);
        resolve(results);
      });

      sendMessage(worker.ws, WSMessageType.PROMO_CODE, { code });
      logger.info('WS-Server', `Sent code ${code} to worker ${worker.id}`);
    });

    promises.push(promise);
  }

  const settled = await Promise.allSettled(promises);
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      allResults.push(...s.value);
    }
  }

  return allResults;
}

/**
 * Check if any workers are connected and authenticated.
 */
export function hasWorkers(): boolean {
  for (const [_, w] of workers) {
    if (w.authenticated) return true;
  }
  return false;
}

/**
 * Get the count of authenticated workers.
 */
export function workerCount(): number {
  let count = 0;
  for (const [_, w] of workers) {
    if (w.authenticated) count++;
  }
  return count;
}

/**
 * Send a typed message over WebSocket.
 */
function sendMessage(ws: WebSocket, type: WSMessageType, payload: any): void {
  const msg: WSMessage = {
    type,
    payload,
    timestamp: Date.now(),
    id: randomUUID(),
  };
  ws.send(JSON.stringify(msg));
}

/**
 * Shutdown the WebSocket server.
 */
export function stopServer(): void {
  if (wss) {
    // Notify all workers
    for (const [_, worker] of workers) {
      sendMessage(worker.ws, WSMessageType.SHUTDOWN, {});
      worker.ws.close();
    }
    workers.clear();
    wss.close();
    logger.info('WS-Server', 'Server stopped');
  }
}
