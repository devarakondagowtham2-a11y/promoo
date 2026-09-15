# Promocode Automation System

A 20-account promo code automation system built with Node.js, TypeScript, and Playwright. Designed to run across 2 laptops (10 accounts each) with WebSocket-based coordination.

## ⚡ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your settings

# 3. Set up accounts (log in manually via browser)
npm run setup

# 4. Test with a single code on one account
npm run test-code

# 5. Start the controller (full system)
npm run start
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                  Laptop 1 — Controller           │
│  ┌─────────┐   ┌──────────┐   ┌──────────────┐ │
│  │ CLI Input│──▶│Dedup     │──▶│Worker Pool   │ │
│  └─────────┘   │Engine    │   │(accounts 1-10│ │
│                 └──────────┘   └──────────────┘ │
│                      │                           │
│                 ┌──────────┐                     │
│                 │WS Server │                     │
│                 └────┬─────┘                     │
└──────────────────────┼───────────────────────────┘
                       │ LAN (WebSocket)
┌──────────────────────┼───────────────────────────┐
│                 ┌────┴─────┐                     │
│                 │WS Client │                     │
│                 └──────────┘                     │
│                      │                           │
│                 ┌──────────────┐                 │
│                 │Worker Pool   │                 │
│                 │(accounts 11-20│                │
│                 └──────────────┘                 │
│                  Laptop 2 — Worker               │
└──────────────────────────────────────────────────┘
```

## 📋 Commands

| Command | Description |
|---------|-------------|
| `npm run setup` | Open browsers to log into each account |
| `npm run start` | Start as controller — accepts codes via CLI |
| `npm run worker` | Start as worker — connects to controller |
| `npm run test-code` | Quick test on one account |
| `npm run build` | Compile TypeScript |

## 🔧 Configuration

### `.env` — Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_MODE` | `true` | **Safety gate** — must be `true` to run |
| `WEBSITE_URL` | `https://o96.app/...` | Target website URL |
| `NODE_ROLE` | `controller` | `controller` or `worker` |
| `WS_PORT` | `9600` | WebSocket server port |
| `WS_AUTH_TOKEN` | — | Shared secret for worker auth |
| `WS_CONTROLLER_URL` | — | Worker: URL to connect to controller |
| `MAX_CONCURRENCY` | `5` | Max parallel browsers (max 10) |
| `ACCOUNT_RANGE_START` | `1` | First account this machine handles |
| `ACCOUNT_RANGE_END` | `10` | Last account this machine handles |
| `HEADLESS` | `false` | Run browsers in headless mode |

### `config/settings.json` — Selectors & Patterns

Customize the UI selectors if the website changes:

```json
{
  "selectors": {
    "promoExpander": "I have a promocode",
    "promoInput": "Enter Promocode",
    "confirmButton": "Confirm"
  }
}
```

## 🔒 Security

- **No passwords stored** — Uses Playwright persistent browser contexts. Log in once via `npm run setup`, cookies are saved.
- **TEST_MODE safety gate** — System refuses to start unless `TEST_MODE=true` in `.env`.
- **WS_AUTH_TOKEN** — WebSocket connections require a shared secret.

## 📁 Project Structure

```
promo-automation/
├── config/
│   ├── accounts.json      # 20 account definitions
│   └── settings.json      # Selectors, timeouts, patterns
├── src/
│   ├── index.ts           # CLI entry point
│   ├── config.ts          # Config loader + safety gate
│   ├── types.ts           # TypeScript interfaces
│   ├── logger.ts          # Structured logging
│   ├── dedup.ts           # Deduplication engine
│   ├── browser/
│   │   ├── context.ts     # Playwright context manager
│   │   └── promo.ts       # Promo code redemption logic
│   ├── worker/
│   │   ├── pool.ts        # Concurrent worker pool
│   │   └── runner.ts      # Single account runner
│   ├── network/
│   │   ├── server.ts      # WebSocket server (controller)
│   │   └── client.ts      # WebSocket client (worker)
│   ├── sources/
│   │   ├── cli.ts         # CLI input source
│   │   └── telegram.ts    # Telegram source (placeholder)
│   └── cli/
│       ├── setup.ts       # Account setup wizard
│       └── test-code.ts   # Single-account test tool
├── accounts/              # Persistent browser profiles
├── data/
│   └── processed_codes.json  # Dedup store
├── logs/                  # Session log files
├── .env                   # Environment config
└── package.json
```

## 🖥️ Dual-Machine Setup

### Laptop 1 (Controller)
```env
NODE_ROLE=controller
ACCOUNT_RANGE_START=1
ACCOUNT_RANGE_END=10
WS_PORT=9600
WS_HOST=0.0.0.0
WS_AUTH_TOKEN=your-secret-token
```

### Laptop 2 (Worker)
```env
NODE_ROLE=worker
ACCOUNT_RANGE_START=11
ACCOUNT_RANGE_END=20
WS_CONTROLLER_URL=ws://192.168.1.100:9600
WS_AUTH_TOKEN=your-secret-token
```

1. Run `npm run setup` on both machines to log into respective accounts
2. Start controller: `npm run start` on Laptop 1
3. Start worker: `npm run worker` on Laptop 2
4. Enter codes on Laptop 1 — they're automatically distributed to both machines
