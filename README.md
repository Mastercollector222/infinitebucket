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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (accounts) | Publishable anon key. Used for public reads + `public.users` writes. |
| `CLOUDINARY_CLOUD_NAME` | Yes (avatars) | Cloudinary cloud name (server-side only). |
| `CLOUDINARY_API_KEY` | Yes (avatars) | Cloudinary API key (server-side only). |
| `CLOUDINARY_API_SECRET` | Yes (avatars) | Cloudinary API secret — **never** prefix with `NEXT_PUBLIC_`. |
| `CLOUDINARY_UPLOAD_PRESET` | No | Signed upload preset name (default `ib_avatars`). |
| `NEXT_PUBLIC_CHAIN_ID` | No | Defaults to `4663` (Robinhood Chain). |
| `NEXT_PUBLIC_TOKEN` | No | INFINITY contract. |
| `NEXT_PUBLIC_RPC` | No | Robinhood Chain RPC URL. |
| `NEXT_PUBLIC_SITE_URL` | No | Canonical URL for metadata/OG (defaults to infinitebucket.net). |
| `NEXT_PUBLIC_X_URL` | No | Override for the X link (defaults to `https://x.com/InfinityBucket_`). |
| `NEXT_PUBLIC_TELEGRAM_URL` | No | Override for the Telegram link (defaults to `https://t.me/InfiniteBucket`). |
| `GIVEAWAY_CUTOFF_TS` | No | Giveaway snapshot cutoff, Unix seconds (default `1790121600` = 23 Sep 2026 00:00 UTC). Server-side only. |
| `GIVEAWAY_PAYOUT_TX` | No | Set to the 50 USDG payout tx hash after the creator sends it — the page links it. Server-side only. |
| `NEXT_PUBLIC_SHOP_WALLET` | Yes (shop) | Wallet that receives shop payments — shown on the checkout screen. |
| `NEXT_PUBLIC_ADMIN_WALLETS` | Yes (admin) | Comma-separated lowercase admin wallets. Public list; the signature check in `/api/admin/shop` is the real gate. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (shop) | Service-role key — **server only, never `NEXT_PUBLIC_`**. All `shop_*` writes are mediated by signature-verified API routes; RLS denies anon writes. |
| `SHIPPING_USD` | No | Flat shipping in USDG added to every order (default `6`). Server-side only. |
| `SHIPPING_ENCRYPTION_KEY` | No | 32-byte hex → AES-256-GCM encrypts `shop_shipments` fields at rest (server-side). Without it fields are plaintext behind RLS + service-role-only access. |

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

-- optional profile columns (bio/socials/avatar)
alter table public.users add column if not exists bio text;
alter table public.users add column if not exists x_url text;
alter table public.users add column if not exists telegram_url text;
alter table public.users add column if not exists website_url text;
alter table public.users add column if not exists avatar_url text;
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

### Profiles + avatars

- `/profile` edits username, bio, and social links on the caller's own row.
- `/u/<username>` is the public read-only profile.
- Avatars upload through `POST /api/avatar`: the wallet signs a fresh
  `Infinite Bucket avatar upload` proof, the route verifies it with
  `viem.verifyMessage`, then does a **signed** Cloudinary upload
  (`avatars/<lowercase-wallet>`) and updates `users.avatar_url` for the
  signer's row only. jpg/png/webp, max 1 MB, no svg. The API secret lives
  only in server env vars.

### Reward the Holders (`/reward-the-holders`)

Read-only giveaway page — the site never custody funds and never asks for
deposits.

- Gate: `balanceOf >= 5,000,000 INFINITY` at the snapshot. Excluded: the
  Uniswap v4 PoolManager, zero/dead addresses, and the creator wallet
  (`0x7c26…6006`).
- **Cutoff: 23 Sep 2026 00:00 UTC = Unix `1790121600`.** ⚠️ The original
  spec wrote `1758412800` — that value is *2025* (one year early). Mountain
  time is also ambiguous: MDT (UTC-6) → 23:00 UTC vs MST (UTC-7) → 00:00
  UTC. We implement 00:00 UTC; override with `GIVEAWAY_CUTOFF_TS=1790118000`
  if the intent was 23:00 UTC (5PM MDT).
- Before cutoff: countdown + live ≥5M holder estimate (not the official
  list).
- After cutoff: `computeGiveaway()` (`src/lib/giveaway.ts`) binary-searches
  the public RPC for the last block `<= cutoff` (snapshot block), then
  **reconstructs balances at that block** by walking back every Transfer
  log between snapshot+1 and the indexer's block — the public RPC prunes
  historical state, so archive `eth_call` is unavailable; log-replay is
  exact for any wallet that held or moved INFINITY. Then
  `winner = uint(block.hash) mod eligible.length` — the math is printed on
  the page.
- The page calls `/api/giveaway` first; if the host can't reach the
  indexer (datacenter IP block), it computes the same result directly in
  the browser — indexer + RPC are CORS-open (same pattern as the engine
  fallback). The server path caches 60s before / 6h after cutoff.
- After the creator sends the 50 USDG, set `GIVEAWAY_PAYOUT_TX=<tx hash>`
  in env and the page links it. Server-side only (no `NEXT_PUBLIC_`).

### Shop (`/shop`) + admin (`/admin/shop`)

Holder-gated merch store. **Setup:** run `supabase/shop.sql` once in the
Supabase SQL editor (creates `shop_settings`, `shop_tiers`, `shop_products`,
`shop_orders`, RLS, and seeds the tiers + two coming-soon products), then set
`NEXT_PUBLIC_SHOP_WALLET`, `NEXT_PUBLIC_ADMIN_WALLETS`, and
`SUPABASE_SERVICE_ROLE_KEY`.

- Catalog: public — every visitor sees every product; logged-out users get
  "Connect to add". Product cards link to `/shop/[id]` detail pages (large
  image, full `description`, price, hold requirement, balance vs
  requirement, discount preview, CTA).
- Per-item gate: `shop_products.min_infinity_tokens` (human units, default
  `0` = any connected wallet can buy). Under the requirement the card and
  detail page stay visible but Add-to-cart is disabled with a
  "Hold {n} $INFINITY" badge + Buy CTA. The server re-checks the live
  on-chain balance at order time — the client badge is UX only. (The old
  store-wide `shop_min_tokens` setting is legacy; the storefront no longer
  locks browsing.)
- Discounts: highest qualifying `shop_tiers` row applies (seeded
  1M→0% / 5M→5% / 10M→10% / 25M→20%).
- Pricing: list price in USDG; amount due is converted to $INFINITY at the
  live pair price (`/api/shop/quote`, GeckoTerminal quote-token price →
  Dexscreener fallback, 30s cache). The server recomputes the discount and
  amount from the wallet's on-chain balance at order time — nothing the
  client sends is trusted.
- Cart: multi-product cart per wallet (localStorage `ib_cart_<wallet>`);
  stock is re-checked server-side at order time and unavailable lines are
  rejected before the order exists.
- Checkout: order created `awaiting_payment` → buyer sends exactly
  `infinity_raw_due` $INFINITY (discounted merch + flat shipping in one
  transfer) to `NEXT_PUBLIC_SHOP_WALLET` → pastes the tx hash → the API
  verifies on Blockscout (to=shop wallet, from=buyer, INFINITY, amount ≥
  due, tx not already used) → `paid_need_address` → shipping form →
  `paid_pending_ship` → admin marks `shipped`. No approvals, no custody
  contract — the site never pulls tokens.
- Shipping: flat `$SHIPPING_USD` (default 6 USDG-equivalent) in $INFINITY
  at the same pool rate. "Flat shipping: $6 in $INFINITY."
- PII: ship-to data lives in `shop_shipments` — no public RLS policies at
  all. Buyer reads/writes it only via `/api/shop/shipment` with a wallet
  signature for an order they own; admins read it only via
  `/api/admin/shop` `get_shipment`. Fields are AES-256-GCM ciphertext when
  `SHIPPING_ENCRYPTION_KEY` (32-byte hex) is set — the Node route does the
  crypto, so the key never reaches Postgres. Without the key: plaintext,
  still RLS + service-role-only. Addresses never appear on `/u`, the
  leaderboard, or any public surface.
- Admin: `/admin/shop` is gated by `NEXT_PUBLIC_ADMIN_WALLETS` + a signed
  login nonce (same signature pattern as profiles). Manage min tokens,
  tiers, products (CRUD — incl. `description` and `min_infinity_tokens`
  per-item gate), view order items + (per-order, signed) shipping address,
  and mark orders shipped with a tracking note.
- Migrations: `supabase/shop.sql`, then `supabase/shop_cart.sql` (cart +
  shipments + new order statuses), then `supabase/shop_per_item.sql`
  (per-item gates + descriptions), then `supabase/shop_product_snapshot.sql`
  (title snapshot on order lines + `ON DELETE SET NULL` product FKs — lets
  products be deleted without losing order history). All safe to re-run.
- Access model: `shop_tiers`/`shop_products`/`shop_settings` are public-read
  via RLS. `shop_orders` has no anon access — all writes and order reads go
  through `/api/shop/orders` and `/api/admin/shop`, which verify the wallet
  signature and write with the service-role key (there is no Supabase Auth
  JWT, so RLS can't express "own wallet" — signature-gated API routes are
  the strict equivalent).

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

- `/` — Home (hero, live stats row, fee-split grid, engine row, official links)
- `/leaderboard` — Top 50 on-chain holders joined to claimed profiles
- `/shop` — Holder-gated merch store (tiers, USDG pricing, $INFINITY payment)
- `/admin/shop` — Shop admin (admin wallets only, signature-gated)
- `/reward-the-holders` — Read-only giveaway: snapshot countdown, eligibility, winner
- `/profile` — Wallet account (username, bio, socials, avatar)
- `/u/[username]` — Public read-only profile (balance, bio, socials, payouts)

## Notes

Informational only, not financial advice. No price, listing, or Robinhood app inclusion is
promised. Robinhood Chain only.
