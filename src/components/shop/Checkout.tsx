"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { loadSession } from "@/lib/auth";
import { CHAIN, TOKEN } from "@/lib/constants";
import { truncateAddress } from "@/lib/format";
import {
  SHOP_WALLET,
  rawToDecimalString,
  tierFor,
  validateShipment,
  type CartLine,
  type ShopOrder,
  type ShopProduct,
  type ShopTier,
  type ShipmentInput,
} from "@/lib/shop";

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export type Proof = { wallet: string; iso: string; signature: string };

// Stored login proof reused as the write signature — same pattern as the
// avatar upload. If the session has no usable proof the caller triggers
// verify() once, then re-reads.
export function sessionProof(): Proof | null {
  const s = loadSession();
  if (!s?.proof || s.proof.v !== 2) return null; // pre-chain-bound → re-sign
  return { wallet: s.wallet, iso: s.proof.iso, signature: s.proof.signature };
}

export type CartLineFull = CartLine & { product: ShopProduct };
export type Quote = { ok: boolean; priceUsdg: number | null; shippingUsdg?: number };

const EMPTY_SHIPMENT: ShipmentInput = {
  recipient_name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postal: "",
  country: "",
  phone: "",
};

export function useQuote(): Quote | null {
  const [quote, setQuote] = useState<Quote | null>(null);
  useEffect(() => {
    fetch("/api/shop/quote")
      .then((r) => r.json())
      .then(setQuote)
      .catch(() => setQuote({ ok: false, priceUsdg: null }));
  }, []);
  return quote;
}

/* ── Checkout modal: cart → pay → ship ─────────────────────────────────── */

export function CheckoutModal({
  lines,
  wallet,
  balance,
  tiers,
  setQty,
  verify,
  signAction,
  onClose,
  onPaid,
  onDone,
}: {
  lines: CartLineFull[];
  wallet: string;
  balance: number;
  tiers: ShopTier[];
  setQty: (id: number, qty: number) => void;
  verify: () => Promise<void>;
  // Action-bound signature (action + order id) — required for pay/ship.
  signAction: (action: string, orderId: number) => Promise<Proof | null>;
  onClose: () => void;
  onPaid: () => void;
  onDone: () => void;
}) {
  const quote = useQuote();
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [step, setStep] = useState<"cart" | "pay" | "ship">("cart");
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tier = tierFor(balance, tiers);
  const pct = tier?.percent ?? 0;
  const shipping = quote?.shippingUsdg ?? 6;
  const merchList = lines.reduce((s, l) => s + l.product.price_usdg * l.qty, 0);
  const merchDue = merchList * (1 - pct / 100);
  const totalUsdg = merchDue + shipping;
  const estInfinity =
    quote?.ok && quote.priceUsdg ? Math.ceil(totalUsdg / quote.priceUsdg) : null;

  // Ensure a usable proof exists; re-sign once if the session lacks one.
  const proof = async (): Promise<Proof | null> => {
    let p = sessionProof();
    if (!p || p.wallet !== wallet.toLowerCase()) {
      await verify();
      p = sessionProof();
    }
    return p;
  };

  const createOrder = async () => {
    if (busy || lines.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const p = await proof();
      if (!p) throw new Error("Sign in first — no verified session.");
      const res = await fetch("/api/shop/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          ...p,
          items: lines.map((l) => ({ product_id: l.product_id, qty: l.qty })),
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Could not create order.");
      setOrder(j.order as ShopOrder);
      setStep("pay");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitTx = async () => {
    if (busy || !order) return;
    setBusy(true);
    setError(null);
    try {
      // Payment marks need an action-bound signature, not the login session.
      const p = await signAction("pay", order.id);
      if (!p) throw new Error("Signature rejected — sign to verify payment.");
      const res = await fetch("/api/shop/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "pay",
          ...p,
          order_id: order.id,
          tx_hash: txHash.trim(),
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Payment not verified.");
      onPaid();
      setStep("ship");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={
      step === "cart" ? "Cart" : step === "pay" ? "Pay with $INFINITY" : "Where to send it"
    }>
      {step === "cart" && (
        <>
          <div className="mt-4 space-y-2">
            {lines.map((l) => (
              <div
                key={l.product_id}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.5)] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--color-white-soft)]">
                    {l.product.title}
                  </p>
                  <p className="font-mono text-xs text-[var(--color-muted)]">
                    {fmt(l.product.price_usdg, 2)} USDG
                  </p>
                </div>
                <div className="flex items-center rounded-lg border border-[var(--color-stroke)]">
                  <button
                    type="button"
                    className="px-2.5 py-1 text-[var(--color-chrome)]"
                    onClick={() => setQty(l.product_id, l.qty - 1)}
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-mono text-xs">{l.qty}</span>
                  <button
                    type="button"
                    className="px-2.5 py-1 text-[var(--color-chrome)] disabled:opacity-30"
                    disabled={l.qty >= l.product.stock}
                    onClick={() => setQty(l.product_id, l.qty + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          <dl className="mt-5 space-y-2 border-t border-[var(--color-stroke)] pt-5 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--color-muted)]">Subtotal</dt>
              <dd className="font-mono">{fmt(merchList, 2)} USDG</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-muted)]">
                Holder discount{tier?.label ? ` (${tier.label})` : ""}
              </dt>
              <dd className="font-mono text-[var(--color-live)]">−{pct}%</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-muted)]">Flat shipping</dt>
              <dd className="font-mono">{fmt(shipping, 2)} USDG</dd>
            </div>
            <div className="flex justify-between border-t border-[var(--color-stroke)] pt-2 font-semibold">
              <dt className="text-[var(--color-white-soft)]">Total</dt>
              <dd className="font-mono">{fmt(totalUsdg, 2)} USDG</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-muted)]">Due in $INFINITY</dt>
              <dd className="font-mono text-[var(--color-chrome)]">
                {estInfinity != null ? `≈ ${fmt(estInfinity)}` : "…"}
              </dd>
            </div>
          </dl>

          {error && <p className="mt-4 text-sm text-[var(--color-sell)]">{error}</p>}
          <button
            type="button"
            onClick={createOrder}
            disabled={busy || lines.length === 0}
            className="btn-metal mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Reserving…" : "Reserve order — get payment details"}
          </button>
          <p className="mt-3 text-center text-xs leading-relaxed text-[var(--color-muted)]">
            Pay in $INFINITY first. Then we ask where to send it. We do not
            publish your address.
          </p>
        </>
      )}

      {step === "pay" && order && (
        <PayStep
          order={order}
          txHash={txHash}
          setTxHash={setTxHash}
          busy={busy}
          error={error}
          onSubmit={submitTx}
        />
      )}

      {step === "ship" && order && (
        <ShipmentForm
          orderId={order.id}
          proof={() => signAction("shipment_set", order.id)}
          busy={busy}
          setBusy={setBusy}
          error={error}
          setError={setError}
          onDone={onDone}
        />
      )}
    </Modal>
  );
}

/* ── Pay step (shared by checkout + "complete payment" resume) ─────────── */

export function PayStep({
  order,
  txHash,
  setTxHash,
  busy,
  error,
  onSubmit,
}: {
  order: ShopOrder;
  txHash: string;
  setTxHash: (v: string) => void;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <>
      <p className="mt-4 text-sm leading-relaxed text-[var(--color-muted)]">
        Send <span className="font-semibold text-[var(--color-white-soft)]">exactly</span> this
        amount (merch + shipping) on Robinhood Chain:
      </p>
      <div className="mt-4 space-y-3">
        <CopyRow
          label="$INFINITY due (exact)"
          display={`${rawToDecimalString(order.infinity_raw_due)} INFINITY`}
          copy={rawToDecimalString(order.infinity_raw_due)}
        />
        <CopyRow
          label="To (shop wallet)"
          display={truncateAddress(SHOP_WALLET, 8)}
          copy={SHOP_WALLET}
        />
        <CopyRow
          label="$INFINITY contract"
          display={truncateAddress(TOKEN.address, 8)}
          copy={TOKEN.address}
        />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-[var(--color-muted)]">
        After sending, paste the transaction hash:
      </p>
      <input
        type="text"
        value={txHash}
        onChange={(e) => setTxHash(e.target.value)}
        placeholder="0x…"
        className="mt-2 w-full rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-4 py-3 font-mono text-xs text-[var(--color-white-soft)] outline-none placeholder:text-[var(--color-muted)] focus:border-[rgba(196,160,255,0.45)]"
      />
      {error && <p className="mt-3 text-sm text-[var(--color-sell)]">{error}</p>}
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(txHash.trim())}
        className="btn-metal mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Checking on-chain…" : "I sent it — verify payment"}
      </button>
      <a
        href={`${CHAIN.explorer}/address/${SHOP_WALLET}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 block text-center font-mono text-xs text-[var(--color-chrome)] underline decoration-[var(--color-stroke)] underline-offset-4 hover:text-[var(--color-white-soft)]"
      >
        View shop wallet on Blockscout ↗
      </a>
    </>
  );
}

// Resume payment for an awaiting_payment order from "My orders".
export function PayModal({
  order,
  signAction,
  onClose,
  onPaid,
}: {
  order: ShopOrder;
  signAction: (action: string, orderId: number) => Promise<Proof | null>;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitTx = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const p = await signAction("pay", order.id);
      if (!p) throw new Error("Signature rejected — sign to verify payment.");
      const res = await fetch("/api/shop/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "pay",
          ...p,
          order_id: order.id,
          tx_hash: txHash.trim(),
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Payment not verified.");
      onPaid();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={`Pay order #${order.id}`}>
      <PayStep
        order={order}
        txHash={txHash}
        setTxHash={setTxHash}
        busy={busy}
        error={error}
        onSubmit={submitTx}
      />
    </Modal>
  );
}

/* ── Shipping form (shared by checkout step + My orders) ───────────────── */

export function ShipmentForm({
  orderId,
  proof,
  busy,
  setBusy,
  error,
  setError,
  onDone,
}: {
  orderId: number;
  proof: () => Promise<Proof | null>;
  busy: boolean;
  setBusy: (b: boolean) => void;
  error: string | null;
  setError: (e: string | null) => void;
  onDone: () => void;
}) {
  const [f, setF] = useState<ShipmentInput>({ ...EMPTY_SHIPMENT });
  const [saved, setSaved] = useState(false);

  const field = (k: keyof ShipmentInput, label: string, required = false) => (
    <label className="block">
      <span className="mb-1 block font-mono text-[0.6rem] uppercase tracking-[0.15em] text-[var(--color-muted)]">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type="text"
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        maxLength={200}
        className="w-full rounded-lg border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-3 py-2.5 text-sm text-[var(--color-white-soft)] outline-none placeholder:text-[var(--color-muted)] focus:border-[rgba(196,160,255,0.45)]"
      />
    </label>
  );

  const submit = async () => {
    if (busy) return;
    const vErr = validateShipment(f);
    if (vErr) {
      setError(vErr);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const p = await proof();
      if (!p) throw new Error("Sign in first — no verified session.");
      const res = await fetch("/api/shop/shipment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set", ...p, order_id: orderId, ...f }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error ?? "Could not save address.");
      setSaved(true);
      setTimeout(onDone, 1600);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <div className="py-8 text-center">
        <p className="font-display text-lg font-bold text-[var(--color-live)]">Order complete</p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Payment verified, address saved — your order is pending shipment.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
        Payment verified. Where should it ship? Your address is stored
        encrypted and is never public.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="col-span-2">{field("recipient_name", "Recipient name", true)}</div>
        <div className="col-span-2">{field("line1", "Address line 1", true)}</div>
        <div className="col-span-2">{field("line2", "Address line 2")}</div>
        {field("city", "City", true)}
        {field("region", "State / region")}
        {field("postal", "Postal code", true)}
        {field("country", "Country", true)}
        <div className="col-span-2">{field("phone", "Phone (optional)")}</div>
      </div>
      {error && <p className="mt-3 text-sm text-[var(--color-sell)]">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="btn-metal mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save shipping address"}
      </button>
    </>
  );
}

/* ── Standalone address modal for paid_need_address orders ─────────────── */

export function AddressModal({
  order,
  signAction,
  onClose,
  onDone,
}: {
  order: ShopOrder;
  signAction: (action: string, orderId: number) => Promise<Proof | null>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal onClose={onClose} title={`Shipping for order #${order.id}`}>
      <ShipmentForm
        orderId={order.id}
        proof={() => signAction("shipment_set", order.id)}
        busy={busy}
        setBusy={setBusy}
        error={error}
        setError={setError}
        onDone={onDone}
      />
    </Modal>
  );
}

/* ── Shared bits ───────────────────────────────────────────────────────── */

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(7,4,12,0.8)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="glass max-h-[90vh] w-full max-w-md overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-display text-xl font-bold text-[var(--color-white-soft)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--color-muted)] transition hover:text-[var(--color-white-soft)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function CopyRow({ label, display, copy }: { label: string; display: string; copy: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(copy);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.6)] px-4 py-3 text-left transition hover:border-[rgba(196,160,255,0.35)]"
    >
      <span>
        <span className="block font-mono text-[0.6rem] uppercase tracking-[0.15em] text-[var(--color-muted)]">
          {label}
        </span>
        <span className="mt-0.5 block break-all font-mono text-sm text-[var(--color-chrome)]">
          {display}
        </span>
      </span>
      <span className="shrink-0 font-mono text-xs text-[var(--color-muted)]">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

export function CartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="20" r="1.6" />
      <circle cx="17" cy="20" r="1.6" />
      <path d="M3 3h2l2.4 12h10.4l2-8H6.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MetalDisc({ size = "h-44 w-44" }: { size?: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div
        className={`${size} rounded-full`}
        style={{
          background:
            "radial-gradient(circle at 32% 28%, #e8dcff 0%, #b08cf0 18%, #6d4fc2 45%, #2c1b52 78%, #160d2a 100%)",
          boxShadow:
            "inset 0 -8px 24px rgba(0,0,0,0.55), inset 0 6px 18px rgba(255,255,255,0.22), 0 18px 44px rgba(0,0,0,0.6)",
        }}
      />
    </div>
  );
}
