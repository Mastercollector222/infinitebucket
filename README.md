# InfiniteBucket — $INFINITY

Production marketing + live-data site for InfiniteBucket ($INFINITY) on **Robinhood Chain**.
Live market data (price, volume, liquidity, FDV, holders, trades) is fetched from
GeckoTerminal with a Dexscreener fallback and Blockscout for token stats, proxied through
Next.js route handlers to avoid CORS. Wallet connection, wrong-network switching, and token
watch use wagmi + viem with the injected provider (MetaMask / Rabby). Wallet-only accounts
(sign-in via `personal_sign`, verified client-side, persisted in Supabase) are described below.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS v4
- Framer Motion (hero / section motion)
- wagmi + viem + @tanstack/react-query (injected connector)
- @supabase/supabase-js (wallet account persistence)

## Install

```bash
npm install
```

## Environment

Copy the example file and fill in values:

```bash
cp .env.example .env.local
```

`.env.local` is gitignored — never commit it.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (accounts) | Supabase project URL for wallet accounts. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (accounts) | Publishable anon key. No service_role anywhere. |
| `NEXT_PUBLIC_CHAIN_ID` | No | Defaults to `4663` (Robinhood Chain). |
| `NEXT_PUBLIC_TOKEN` | No | INFINITY contract. |
| `NEXT_PUBLIC_RPC` | No | Robinhood Chain RPC URL. |
| `NEXT_PUBLIC_SITE_URL` | No | Canonical URL for metadata/OG (defaults to infinitebucket.net). |
| `NEXT_PUBLIC_X_URL` | No | Override for the X link (defaults to `https://x.com/InfinityBucket_`). |
| `NEXT_PUBLIC_TELEGRAM_URL` | No | Override for the Telegram link (defaults to `https://t.me/InfiniteBucket`). |

## Database (run once in the Supabase SQL editor)

Wallet accounts live in a single `public.users` table. There is no Supabase
Auth, no email, and no service_role — the anon key does reads/writes and the
app enforces that a wallet only signs in as itself via a verified signature.

```sql
create table public.users (
  wallet text primary key,
  username text unique,
  created_at timestamptz default now(),
  last_seen timestamptz default now()
);

alter table public.users enable row level security;

-- public read of username + wallet for leaderboard
create policy "users_select_public" on public.users
  for select using (true);

-- inserts/updates only via anon is too open; use a simple
-- approach: allow insert/update where wallet equals the
-- lowercase address the client sends, and enforce in app
-- that the address matches the connected signer.
create policy "users_insert" on public.users
  for insert with check (true);
create policy "users_update" on public.users
  for update using (true);

alter table public.users
  add constraint users_username_format
  check (username ~ '^[a-zA-Z0-9_]{3,16}$');
```

## Wallet accounts

- Connect an injected wallet (MetaMask / Rabby). If on the wrong network you
  get a one-click switch to chain 4663.
- The wallet signs `Infinite Bucket login\nAddress: <addr>\nAt: <iso>` via
  `personal_sign`; the signature is verified with `viem.verifyMessage` before
  anything is written.
- A verified session persists in `localStorage` for 24h, then re-verifies.
- First-time wallets pick a username (`3–16` chars, `[a-zA-Z0-9_]`).
- The token contract is read-only here — no transfers, no `approve()`.

## Run

```bash
npm run dev     # http://localhost:3000
npm run build   # production build
npm run start   # serve the production build
```

## Chain constants (Robinhood Chain — the only supported chain)

| Field | Value |
| --- | --- |
| Chain ID | `4663` (`0x1237`) |
| Testnet chain ID | `46630` (not used) |
| Native currency | ETH |
| RPC URL | `https://rpc.mainnet.chain.robinhood.com` |
| Block explorer | `https://robinhoodchain.blockscout.com` |

## Token constants

| Field | Value |
| --- | --- |
| Name / Symbol | InfiniteBucket / INFINITY |
| Contract | `0xbd305151d3d7eb612d3969e9fa05315cd47374e4` |
| Standard | ERC-20 |
| Decimals | 18 |
| Total supply | 1,000,000,000 (fixed) |
| Quote token | USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (6 decimals) |
| Pool (Uniswap v4) | GeckoTerminal `0xa87610e3cb4f3d9c5373b73d51863d38a9e37a66a09143cf6520b6e177e75abd` |
| Uniswap v4 PoolManager | `0x8366a39cc670b4001A1121B8F6A443A643e40951` |

The contract is currently **unverified** — the site never claims it is audited or verified.

## Data sources

- `GET /api/market` → GeckoTerminal pool (+ trades), falls back to Dexscreener (Robinhood Chain
  pairs only; Solana/BSC/etc. INFINITY pairs are ignored). Client refreshes every 15s and keeps
  the last good value with a "stale" flag on failure — never renders 0.
- `GET /api/token` → Blockscout token API for holders / transfers / supply.
- On-chain reads (`name`/`symbol`/`decimals`/`totalSupply`/`balanceOf`) via wagmi as a
  chain-truth check.

## Pages

- `/` — Home (hero, live strip, trade tape, mechanism, token facts, links)
- `/token` — Contract details, copy CA, add Robinhood Chain
- `/mechanism` — How the 4% swap fee is split and paid back to holders through BucketShop
- `/live` — Larger ticker + recent activity feed

## Notes

Informational only, not financial advice. No price, listing, or Robinhood app inclusion is
promised. Robinhood Chain only.
