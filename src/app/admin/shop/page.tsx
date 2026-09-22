"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { loadSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  adminWallets,
  formatInfinityRaw,
  type ShopOrder,
  type ShopProduct,
  type ShopTier,
} from "@/lib/shop";
import { truncateAddress } from "@/lib/format";

type Proof = { wallet: string; iso: string; signature: string };

function proof(): Proof | null {
  const s = loadSession();
  // v2 = chain-bound message format; older proofs must be re-signed.
  return s?.proof?.v === 2
    ? { wallet: s.wallet, iso: s.proof.iso, signature: s.proof.signature }
    : null;
}

async function adminCall(action: string, payload: Record<string, unknown> = {}) {
  const p = proof();
  if (!p) throw new Error("No verified session — sign in again.");
  const res = await fetch("/api/admin/shop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...p, action, ...payload }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error ?? "Request failed.");
  return j;
}

export default function AdminShopPage() {
  const { status, address, connect, verify, signAction } = useAuth();
  const admins = adminWallets();
  const wallet = address?.toLowerCase();
  const authorized = wallet != null && admins.includes(wallet);
  const connected = status === "ready" || status === "needs_username";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 pt-14 sm:px-6">
      <header className="mb-8">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-[var(--color-live)]">
          Admin
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-[var(--color-white-soft)]">
          Shop <span className="text-chrome">admin</span>
        </h1>
      </header>

      {!connected ? (
        <div className="glass max-w-md p-8 text-center">
          <p className="text-sm text-[var(--color-muted)]">
            Connect an admin wallet to manage the shop.
          </p>
          <button
            type="button"
            onClick={connect}
            className="btn-metal mt-5 rounded-xl px-6 py-3 text-sm font-semibold"
          >
            {status === "needs_verify" ? "Sign in with wallet" : "Connect wallet"}
          </button>
        </div>
      ) : !authorized ? (
        <div className="glass max-w-md p-8 text-center">
          <p className="font-display text-lg font-bold text-[var(--color-white-soft)]">
            Not an admin wallet
          </p>
          <p className="mt-2 font-mono text-xs text-[var(--color-muted)]">
            {wallet ? truncateAddress(wallet, 6) : ""}
          </p>
        </div>
      ) : (
        <AdminPanel verify={verify} signAction={signAction} />
      )}
    </main>
  );
}

function AdminPanel({
  verify,
  signAction,
}: {
  verify: () => Promise<void>;
  signAction: (
    action: string,
    orderId: number,
  ) => Promise<Proof | null>;
}) {
  const [tab, setTab] = useState<"orders" | "products" | "tiers" | "settings">("orders");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      setError(null);
      setNotice(null);
      try {
        return await adminCall(action, payload);
      } catch (e) {
        const msg = (e as Error).message;
        if (/stale|signature|session/i.test(msg)) {
          // Re-sign once — session proof may have expired.
          await verify();
          try {
            return await adminCall(action, payload);
          } catch (e2) {
            setError((e2 as Error).message);
            return null;
          }
        }
        setError(msg);
        return null;
      }
    },
    [verify],
  );

  return (
    <>
      <div className="mb-6 flex gap-2">
        {(["orders", "products", "tiers", "settings"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-medium capitalize transition ${
              tab === t
                ? "btn-metal"
                : "border border-[var(--color-stroke)] text-[var(--color-muted)] hover:text-[var(--color-chrome)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-[var(--color-sell)]/40 bg-[rgba(255,93,122,0.08)] px-4 py-3 text-sm text-[var(--color-sell)]">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 rounded-xl border border-[var(--color-live)]/40 bg-[rgba(62,224,164,0.08)] px-4 py-3 text-sm text-[var(--color-live)]">
          {notice}
        </p>
      )}

      {tab === "orders" && (
        <OrdersTab run={run} signAction={signAction} onDone={() => setNotice("Saved.")} />
      )}
      {tab === "products" && (
        <ProductsTab run={run} verify={verify} onDone={() => setNotice("Saved.")} />
      )}
      {tab === "tiers" && <TiersTab run={run} onDone={() => setNotice("Saved.")} />}
      {tab === "settings" && <SettingsTab run={run} onDone={() => setNotice("Saved.")} />}
    </>
  );
}

type Run = (action: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown> | null>;

/* ── Orders ────────────────────────────────────────────────────────────── */

function itemsSummary(o: ShopOrder): string {
  const items = o.shop_order_items ?? [];
  if (items.length === 0) {
    // Legacy single-item rows (pre-cart schema).
    return o.qty != null ? `product #${o.product_id} ×${o.qty}` : "—";
  }
  return items
    .map(
      (i) => `${i.title || i.shop_products?.title || `#${i.product_id}`} ×${i.qty}`,
    )
    .join(", ");
}

function OrdersTab({
  run,
  signAction,
  onDone,
}: {
  run: Run;
  signAction: (action: string, orderId: number) => Promise<Proof | null>;
  onDone: () => void;
}) {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [filter, setFilter] = useState("");
  const [tracking, setTracking] = useState<Record<number, string>>({});
  const [shipments, setShipments] = useState<Record<number, Record<string, string> | null>>({});

  const load = useCallback(async () => {
    const j = await run("list_orders", filter ? { status: filter } : {});
    if (j?.orders) setOrders(j.orders as ShopOrder[]);
  }, [run, filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="glass p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {["", "awaiting_payment", "paid_need_address", "paid_pending_ship", "needs_refund", "shipped", "cancelled"].map((s) => (
          <button
            key={s || "all"}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 font-mono text-[0.65rem] transition ${
              filter === s
                ? "border-[var(--color-live)]/40 text-[var(--color-live)]"
                : "border-[var(--color-stroke)] text-[var(--color-muted)] hover:text-[var(--color-chrome)]"
            }`}
          >
            {s || "all"}
          </button>
        ))}
        <button
          type="button"
          onClick={load}
          className="ml-auto font-mono text-xs text-[var(--color-chrome)] hover:underline"
        >
          Refresh
        </button>
      </div>

      {orders.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--color-muted)]">No orders.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div
              key={o.id}
              className="rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.5)] p-4"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-mono text-[var(--color-muted)]">#{o.id}</span>
                <span className="font-medium text-[var(--color-white-soft)]">
                  {itemsSummary(o)}
                </span>
                <span className="font-mono text-xs text-[var(--color-chrome)]">
                  {o.total_usdg ?? o.usdg_due} USDG ·{" "}
                  {formatInfinityRaw(o.infinity_raw_due)} INFINITY · {o.discount_pct}% off
                </span>
                <span className="ml-auto font-mono text-[0.65rem] uppercase tracking-wider text-[var(--color-muted)]">
                  {o.status}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-[var(--color-muted)]">
                <span>{o.wallet}</span>
                {o.tx_hash && (
                  <a
                    href={`https://robinhoodchain.blockscout.com/tx/${o.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-chrome)] hover:underline"
                  >
                    {truncateAddress(o.tx_hash, 8)} ↗
                  </a>
                )}
                <span>{new Date(o.created_at).toLocaleString()}</span>
              </div>
              {(o.status === "paid_pending_ship" || o.status === "shipped") && (
                <div className="mt-3">
                  {shipments[o.id] === undefined ? (
                    <button
                      type="button"
                      onClick={async () => {
                        // PII reads need a per-order action signature.
                        const p = await signAction("admin_get_shipment", o.id);
                        if (!p) return;
                        const res = await fetch("/api/admin/shop", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({
                            ...p,
                            action: "get_shipment",
                            order_id: o.id,
                          }),
                        });
                        const j = await res.json();
                        if (j?.ok) {
                          setShipments((s) => ({
                            ...s,
                            [o.id]: (j.shipment as Record<string, string> | null) ?? null,
                          }));
                        }
                      }}
                      className="font-mono text-xs text-[var(--color-chrome)] hover:underline"
                    >
                      View shipping address
                    </button>
                  ) : shipments[o.id] === null ? (
                    <p className="font-mono text-xs text-[var(--color-muted)]">
                      No address submitted yet.
                    </p>
                  ) : (
                    <div className="rounded-lg border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.6)] px-4 py-3 font-mono text-xs leading-relaxed text-[var(--color-chrome)]">
                      <p>{shipments[o.id]!.recipient_name}</p>
                      <p>
                        {shipments[o.id]!.line1}
                        {shipments[o.id]!.line2 ? `, ${shipments[o.id]!.line2}` : ""}
                      </p>
                      <p>
                        {shipments[o.id]!.city}
                        {shipments[o.id]!.region ? `, ${shipments[o.id]!.region}` : ""}{" "}
                        {shipments[o.id]!.postal}
                      </p>
                      <p>{shipments[o.id]!.country}</p>
                      {shipments[o.id]!.phone && <p>Phone: {shipments[o.id]!.phone}</p>}
                    </div>
                  )}
                </div>
              )}
              {o.status === "paid_pending_ship" && (
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={tracking[o.id] ?? ""}
                    onChange={(e) =>
                      setTracking((t) => ({ ...t, [o.id]: e.target.value }))
                    }
                    placeholder="Tracking note (optional)"
                    className="min-w-0 flex-1 rounded-lg border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-3 py-2 text-xs text-[var(--color-white-soft)] outline-none placeholder:text-[var(--color-muted)] focus:border-[rgba(196,160,255,0.45)]"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const j = await run("mark_shipped", {
                        id: o.id,
                        tracking_note: tracking[o.id] ?? "",
                      });
                      if (j?.ok) {
                        onDone();
                        load();
                      }
                    }}
                    className="btn-metal rounded-lg px-4 py-2 text-xs font-semibold"
                  >
                    Mark shipped
                  </button>
                </div>
              )}
              {o.status === "awaiting_payment" && (
                <button
                  type="button"
                  onClick={async () => {
                    const j = await run("cancel_order", { id: o.id });
                    if (j?.ok) {
                      onDone();
                      load();
                    }
                  }}
                  className="mt-3 font-mono text-xs text-[var(--color-sell)] hover:underline"
                >
                  Cancel order
                </button>
              )}
              {o.tracking_note && (
                <p className="mt-2 text-xs text-[var(--color-muted)]">
                  Tracking: {o.tracking_note}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Products ──────────────────────────────────────────────────────────── */

const emptyProduct = {
  id: 0,
  title: "",
  blurb: "",
  description: "",
  images: [] as string[],
  price_usdg: "",
  stock: "0",
  min_infinity_tokens: "0",
  active: false,
  sort: "0",
};

const CLOUDINARY_PREFIX = "https://res.cloudinary.com/";

function ProductsTab({
  run,
  verify,
  onDone,
}: {
  run: Run;
  verify: () => Promise<void>;
  onDone: () => void;
}) {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [form, setForm] = useState({ ...emptyProduct });
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imgErr, setImgErr] = useState<string | null>(null);

  // Products are public-read; the anon client can list them for the admin UI.
  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("shop_products").select("*").order("sort");
    setProducts((data as ShopProduct[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    const j = await run("upsert_product", {
      ...(form.id ? { id: form.id } : {}),
      title: form.title,
      blurb: form.blurb,
      description: form.description,
      images: form.images,
      price_usdg: Number(form.price_usdg),
      stock: Number(form.stock),
      min_infinity_tokens: Number(form.min_infinity_tokens) || 0,
      active: form.active,
      sort: Number(form.sort) || 0,
    });
    if (j?.ok) {
      setForm({ ...emptyProduct });
      setUrlInput("");
      onDone();
      load();
    }
  };

  const addImage = (u: string) => {
    const url = u.trim();
    setImgErr(null);
    if (form.images.length >= 6) return setImgErr("Max 6 images per product.");
    if (!url.startsWith(CLOUDINARY_PREFIX)) {
      return setImgErr("Images must be https://res.cloudinary.com/ URLs.");
    }
    setForm((f) => ({ ...f, images: [...f.images, url] }));
    setUrlInput("");
  };

  const moveImage = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= form.images.length) return;
    const next = [...form.images];
    [next[i], next[j]] = [next[j], next[i]];
    setForm({ ...form, images: next });
  };

  // Admin-signed upload → server Cloudinary SDK (secret never leaves API).
  const upload = async (file: File) => {
    setImgErr(null);
    setUploading(true);
    try {
      let p = proof();
      if (!p) {
        await verify();
        p = proof();
      }
      if (!p) throw new Error("No verified session — sign in again.");
      const fd = new FormData();
      fd.set("wallet", p.wallet);
      fd.set("iso", p.iso);
      fd.set("signature", p.signature);
      fd.set("product_id", form.id ? String(form.id) : "temp");
      fd.set("file", file);
      const res = await fetch("/api/admin/shop/image", { method: "POST", body: fd });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Upload failed.");
      setForm((f) => (f.images.length >= 6 ? f : { ...f, images: [...f.images, j.url] }));
    } catch (e) {
      setImgErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const input =
    "w-full rounded-lg border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-3 py-2 text-sm text-[var(--color-white-soft)] outline-none placeholder:text-[var(--color-muted)] focus:border-[rgba(196,160,255,0.45)]";

  return (
    <div className="space-y-5">
      <div className="glass p-5">
        <h3 className="mb-4 font-display text-base font-bold text-[var(--color-white-soft)]">
          {form.id ? `Edit product #${form.id}` : "New product"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={input} placeholder="Title" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className={input} placeholder="Price USDG" inputMode="decimal"
            value={form.price_usdg}
            onChange={(e) => setForm({ ...form, price_usdg: e.target.value })} />
          <div className="flex gap-3">
            <input className={input} placeholder="Stock" inputMode="numeric" value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            <input className={input} placeholder="Sort" inputMode="numeric" value={form.sort}
              onChange={(e) => setForm({ ...form, sort: e.target.value })} />
          </div>
          <input className={input} inputMode="numeric"
            placeholder="Min $INFINITY to buy (0 = any connected wallet)"
            value={form.min_infinity_tokens}
            onChange={(e) => setForm({ ...form, min_infinity_tokens: e.target.value })} />
          <textarea className={input} placeholder="Blurb (grid card teaser)" rows={2}
            value={form.blurb}
            onChange={(e) => setForm({ ...form, blurb: e.target.value })} />
          <textarea className={`${input} sm:col-span-2`} rows={4}
            placeholder="Description (detail page — plain text, no HTML)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />

          {/* Images — max 6, first = grid thumbnail */}
          <div className="sm:col-span-2">
            <p className="mb-2 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-[var(--color-muted)]">
              Images ({form.images.length}/6) — first is the grid thumbnail
            </p>
            {form.images.length > 0 && (
              <div className="mb-2 space-y-1.5">
                {form.images.map((u, i) => (
                  <div
                    key={`${u}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.6)] px-2 py-1.5"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={u}
                      alt={`Image ${i + 1}`}
                      className="h-10 w-10 rounded-md border border-[var(--color-stroke)] object-cover"
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-[0.65rem] text-[var(--color-muted)]">
                      {i === 0 ? "★ " : ""}{u}
                    </span>
                    <button type="button" disabled={i === 0} aria-label="Move up"
                      onClick={() => moveImage(i, -1)}
                      className="px-1.5 text-xs text-[var(--color-chrome)] disabled:opacity-25">↑</button>
                    <button type="button" disabled={i === form.images.length - 1} aria-label="Move down"
                      onClick={() => moveImage(i, 1)}
                      className="px-1.5 text-xs text-[var(--color-chrome)] disabled:opacity-25">↓</button>
                    <button type="button" aria-label="Remove image"
                      onClick={() => setForm({ ...form, images: form.images.filter((_, j) => j !== i) })}
                      className="px-1.5 text-xs text-[var(--color-sell)]">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                className={input}
                placeholder="https://res.cloudinary.com/…"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
              <button
                type="button"
                onClick={() => addImage(urlInput)}
                disabled={form.images.length >= 6 || !urlInput.trim()}
                className="shrink-0 rounded-lg border border-[var(--color-stroke)] px-3 py-2 text-xs text-[var(--color-chrome)] disabled:opacity-40"
              >
                Add URL
              </button>
              <label
                className={`shrink-0 cursor-pointer rounded-lg border border-[rgba(196,160,255,0.35)] px-3 py-2 text-xs text-[var(--color-chrome)] ${uploading || form.images.length >= 6 ? "pointer-events-none opacity-40" : ""}`}
              >
                {uploading ? "Uploading…" : "Upload image"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) upload(f);
                  }}
                />
              </label>
            </div>
            {imgErr && <p className="mt-2 text-xs text-[var(--color-sell)]">{imgErr}</p>}
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <input type="checkbox" checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Active (visible for purchase)
        </label>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={save} disabled={!form.title.trim() || !form.price_usdg}
            className="btn-metal rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-40">
            {form.id ? "Save changes" : "Add product"}
          </button>
          {form.id !== 0 && (
            <button type="button" onClick={() => setForm({ ...emptyProduct })}
              className="rounded-xl border border-[var(--color-stroke)] px-4 py-2.5 text-sm text-[var(--color-muted)]">
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="glass divide-y divide-[var(--color-stroke)]">
        {products.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[var(--color-white-soft)]">
                {p.title}
                {!p.active && (
                  <span className="ml-2 rounded-full border border-[var(--color-stroke)] px-2 py-0.5 font-mono text-[0.6rem] uppercase text-[var(--color-muted)]">
                    hidden
                  </span>
                )}
              </p>
              <p className="mt-0.5 font-mono text-xs text-[var(--color-muted)]">
                {p.price_usdg} USDG · stock {p.stock} · sort {p.sort}
                {Number(p.min_infinity_tokens) > 0 &&
                  ` · gate ${Number(p.min_infinity_tokens).toLocaleString()} INFINITY`}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setForm({
                  id: p.id,
                  title: p.title,
                  blurb: p.blurb,
                  description: p.description ?? "",
                  images: p.images?.length
                    ? p.images
                    : p.image_url
                      ? [p.image_url]
                      : [],
                  price_usdg: String(p.price_usdg),
                  stock: String(p.stock),
                  min_infinity_tokens: String(p.min_infinity_tokens ?? 0),
                  active: p.active,
                  sort: String(p.sort),
                })
              }
              className="rounded-lg border border-[var(--color-stroke)] px-3 py-1.5 text-xs text-[var(--color-chrome)] hover:border-[rgba(196,160,255,0.35)]"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={async () => {
                const j = await run("delete_product", { id: p.id });
                if (j?.ok) {
                  onDone();
                  load();
                }
              }}
              className="rounded-lg border border-[var(--color-sell)]/30 px-3 py-1.5 text-xs text-[var(--color-sell)] hover:bg-[rgba(255,93,122,0.08)]"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Tiers ─────────────────────────────────────────────────────────────── */

function TiersTab({ run, onDone }: { run: Run; onDone: () => void }) {
  const [tiers, setTiers] = useState<ShopTier[]>([]);
  const [form, setForm] = useState({ id: 0, min_tokens: "", percent: "", label: "", sort: "0" });

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("shop_tiers").select("*").order("sort");
    setTiers((data as ShopTier[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const input =
    "w-full rounded-lg border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-3 py-2 text-sm text-[var(--color-white-soft)] outline-none placeholder:text-[var(--color-muted)] focus:border-[rgba(196,160,255,0.45)]";

  return (
    <div className="space-y-5">
      <div className="glass p-5">
        <h3 className="mb-4 font-display text-base font-bold text-[var(--color-white-soft)]">
          {form.id ? `Edit tier #${form.id}` : "New tier"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <input className={input} placeholder="Min $INFINITY" inputMode="numeric"
            value={form.min_tokens}
            onChange={(e) => setForm({ ...form, min_tokens: e.target.value })} />
          <input className={input} placeholder="Percent off" inputMode="numeric"
            value={form.percent}
            onChange={(e) => setForm({ ...form, percent: e.target.value })} />
          <input className={input} placeholder="Label" value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <input className={input} placeholder="Sort" inputMode="numeric" value={form.sort}
            onChange={(e) => setForm({ ...form, sort: e.target.value })} />
        </div>
        <button
          type="button"
          disabled={!form.min_tokens || !form.percent}
          onClick={async () => {
            const j = await run("upsert_tier", {
              ...(form.id ? { id: form.id } : {}),
              min_tokens: Number(form.min_tokens),
              percent: Number(form.percent),
              label: form.label,
              sort: Number(form.sort) || 0,
            });
            if (j?.ok) {
              setForm({ id: 0, min_tokens: "", percent: "", label: "", sort: "0" });
              onDone();
              load();
            }
          }}
          className="btn-metal mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
        >
          {form.id ? "Save tier" : "Add tier"}
        </button>
      </div>

      <div className="glass divide-y divide-[var(--color-stroke)]">
        {tiers.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-5 py-4">
            <p className="flex-1 font-mono text-sm text-[var(--color-white-soft)]">
              {t.min_tokens.toLocaleString()}+ INFINITY →{" "}
              <span className="text-[var(--color-live)]">{t.percent}%</span>
              {t.label && (
                <span className="ml-2 text-xs text-[var(--color-muted)]">{t.label}</span>
              )}
            </p>
            <button
              type="button"
              onClick={() =>
                setForm({
                  id: t.id,
                  min_tokens: String(t.min_tokens),
                  percent: String(t.percent),
                  label: t.label,
                  sort: String(t.sort),
                })
              }
              className="rounded-lg border border-[var(--color-stroke)] px-3 py-1.5 text-xs text-[var(--color-chrome)] hover:border-[rgba(196,160,255,0.35)]"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={async () => {
                const j = await run("delete_tier", { id: t.id });
                if (j?.ok) {
                  onDone();
                  load();
                }
              }}
              className="rounded-lg border border-[var(--color-sell)]/30 px-3 py-1.5 text-xs text-[var(--color-sell)] hover:bg-[rgba(255,93,122,0.08)]"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Settings ──────────────────────────────────────────────────────────── */

function SettingsTab({ run, onDone }: { run: Run; onDone: () => void }) {
  const [min, setMin] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("shop_settings")
      .select("value")
      .eq("key", "shop_min_tokens")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) setMin(data.value);
        setLoaded(true);
      });
  }, []);

  return (
    <div className="glass max-w-md p-5">
      <h3 className="font-display text-base font-bold text-[var(--color-white-soft)]">
        Shop gate
      </h3>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Minimum $INFINITY balance required to see products.
      </p>
      <input
        type="text"
        inputMode="numeric"
        value={min}
        onChange={(e) => setMin(e.target.value)}
        placeholder="1000000"
        className="mt-4 w-full rounded-lg border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-3 py-2 font-mono text-sm text-[var(--color-white-soft)] outline-none focus:border-[rgba(196,160,255,0.45)]"
      />
      <button
        type="button"
        disabled={!loaded || !min}
        onClick={async () => {
          const j = await run("set_min_tokens", { value: Number(min) });
          if (j?.ok) onDone();
        }}
        className="btn-metal mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
      >
        Save
      </button>
    </div>
  );
}
