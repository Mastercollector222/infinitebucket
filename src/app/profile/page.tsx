"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSignMessage } from "wagmi";
import { useAuth } from "@/components/AuthContext";
import { Avatar } from "@/components/Avatar";
import { USERNAME_RE, avatarMessage, loadSession } from "@/lib/auth";
import {
  BIO_MAX,
  checkBio,
  checkTelegramUrl,
  checkWebsiteUrl,
  checkXUrl,
  emptyToNull,
} from "@/lib/profile";
import { truncateAddress } from "@/lib/format";

// Wallet-owned profile: edit username + optional fields on the caller's own
// users row. Save only ever UPDATEs that row.
export default function ProfilePage() {
  const { status, address, row, connect, verify, saveProfile, setAvatar, error: authError } =
    useAuth();
  const { signMessageAsync } = useSignMessage();
  const fileRef = useRef<HTMLInputElement>(null);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [xUrl, setXUrl] = useState("");
  const [tgUrl, setTgUrl] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Prefill once the users row lands.
  useEffect(() => {
    if (!row) return;
    setUsername(row.username ?? "");
    setBio(row.bio ?? "");
    setXUrl(row.x_url ?? "");
    setTgUrl(row.telegram_url ?? "");
    setWebUrl(row.website_url ?? "");
  }, [row]);

  const connected = status === "ready" || status === "needs_username";

  // Signed upload: the wallet signs a fresh proof, then the file + proof go to
  // /api/avatar which verifies before touching Cloudinary or the users row.
  const uploadAvatarFile = async (file: File) => {
    if (!address || avatarBusy) return;
    setAvatarErr(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setAvatarErr("Only jpg, png, or webp images.");
      return;
    }
    if (file.size > 1_048_576) {
      setAvatarErr("Avatar must be 1 MB or smaller.");
      return;
    }
    setAvatarBusy(true);
    try {
      // Reuse the login signature as the upload proof when we have one —
      // avoids a second wallet popup. The API route accepts either proof.
      const prior = loadSession();
      let iso: string;
      let signature: string;
      if (prior?.proof?.v === 2 && prior.wallet === address.toLowerCase()) {
        iso = prior.proof.iso;
        signature = prior.proof.signature;
      } else {
        iso = new Date().toISOString();
        try {
          signature = await signMessageAsync({
            message: avatarMessage(address, iso),
          });
        } catch (e) {
          const msg = (e as { shortMessage?: string; message?: string }).shortMessage
            ?? (e as Error).message;
          setAvatarErr(
            /reject|denied|cancel/i.test(msg)
              ? "Signature request rejected."
              : `Sign-in failed: ${msg}`,
          );
          return;
        }
      }
      const form = new FormData();
      form.append("file", file);
      form.append("address", address);
      form.append("iso", iso);
      form.append("signature", signature);
      const res = await fetch("/api/avatar", { method: "POST", body: form });
      const json = (await res.json()) as { ok: boolean; avatar_url?: string; error?: string };
      if (!res.ok || !json.ok || !json.avatar_url) {
        // Server-side failure — show the real reason, never relabel it.
        setAvatarErr(json.error ?? "Upload failed.");
        return;
      }
      setAvatar(json.avatar_url);
    } catch (e) {
      setAvatarErr((e as Error).message ?? "Upload failed.");
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFieldErr(null);
    setSaved(false);

    const name = username.trim();
    const err =
      (!USERNAME_RE.test(name) && "Username: 3–16 chars — letters, numbers, underscore.") ||
      checkBio(bio) ||
      checkXUrl(xUrl) ||
      checkTelegramUrl(tgUrl) ||
      checkWebsiteUrl(webUrl);
    if (err) {
      setFieldErr(err);
      return;
    }

    setSaving(true);
    const saveErr = await saveProfile({
      username: name,
      bio: emptyToNull(bio),
      x_url: emptyToNull(xUrl),
      telegram_url: emptyToNull(tgUrl),
      website_url: emptyToNull(webUrl),
    });
    setSaving(false);
    if (saveErr) setFieldErr(saveErr);
    else setSaved(true);
  };

  return (
    <div className="mx-auto max-w-xl py-14 pb-28 lg:pb-16">
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        Your <span className="text-chrome">profile</span>
      </h1>

      {!connected ? (
        <div className="glass mt-8 flex flex-col items-start gap-4 p-6">
          <p className="text-sm text-[var(--color-muted)]">
            {status === "needs_verify" || status === "signing"
              ? "Sign the message in your wallet to continue."
              : "Connect your wallet to edit your profile."}
          </p>
          {status === "needs_verify" || status === "signing" ? (
            <button
              type="button"
              onClick={() => verify()}
              disabled={status === "signing"}
              className="btn-metal rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {status === "signing" ? "Check wallet…" : "Sign in"}
            </button>
          ) : (
            <button
              type="button"
              onClick={connect}
              disabled={status === "connecting"}
              className="btn-metal rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {status === "connecting" ? "Connecting…" : "Connect wallet"}
            </button>
          )}
          {authError && <p className="text-sm text-[var(--color-sell)]">{authError}</p>}
        </div>
      ) : (
        <form onSubmit={submit} className="glass mt-8 flex flex-col gap-5 p-6">
          <div className="flex items-center gap-4">
            <Avatar
              url={row?.avatar_url}
              wallet={address}
              username={row?.username}
              size={96}
            />
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                disabled={avatarBusy}
                onClick={() => fileRef.current?.click()}
                className="btn-ghost rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {avatarBusy ? "Check wallet…" : "Change avatar"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadAvatarFile(f);
                }}
              />
              <span className="text-xs text-[var(--color-muted)]">
                jpg · png · webp — max 1 MB
              </span>
              {avatarErr && (
                <span className="text-xs text-[var(--color-sell)]">{avatarErr}</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-sm text-[var(--color-muted)]">
              {address ? truncateAddress(address) : ""}
            </span>
            {row?.username && (
              <Link
                href={`/u/${encodeURIComponent(row.username)}`}
                className="text-sm text-[var(--color-amethyst)] transition hover:text-[var(--color-chrome)]"
              >
                View public profile →
              </Link>
            )}
          </div>

          <Field label="Username" hint="3–16 · letters, numbers, underscore">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={16}
              className="w-full rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-4 py-3 font-mono text-sm text-[var(--color-white-soft)] outline-none transition placeholder:text-[var(--color-muted)] focus:border-[rgba(196,160,255,0.45)]"
            />
          </Field>

          <Field label="Bio" hint={`${bio.length}/${BIO_MAX}`}>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={BIO_MAX + 40}
              rows={3}
              className="w-full resize-none rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-4 py-3 text-sm text-[var(--color-white-soft)] outline-none transition placeholder:text-[var(--color-muted)] focus:border-[rgba(196,160,255,0.45)]"
            />
          </Field>

          <Field label="X" hint="https://x.com/…">
            <input
              type="url"
              value={xUrl}
              onChange={(e) => setXUrl(e.target.value)}
              placeholder="https://x.com/you"
              className="w-full rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-4 py-3 font-mono text-sm text-[var(--color-white-soft)] outline-none transition placeholder:text-[var(--color-muted)] focus:border-[rgba(196,160,255,0.45)]"
            />
          </Field>

          <Field label="Telegram" hint="https://t.me/…">
            <input
              type="url"
              value={tgUrl}
              onChange={(e) => setTgUrl(e.target.value)}
              placeholder="https://t.me/you"
              className="w-full rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-4 py-3 font-mono text-sm text-[var(--color-white-soft)] outline-none transition placeholder:text-[var(--color-muted)] focus:border-[rgba(196,160,255,0.45)]"
            />
          </Field>

          <Field label="Website" hint="https:// only">
            <input
              type="url"
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
              placeholder="https://yoursite.xyz"
              className="w-full rounded-xl border border-[var(--color-stroke)] bg-[rgba(14,8,22,0.8)] px-4 py-3 font-mono text-sm text-[var(--color-white-soft)] outline-none transition placeholder:text-[var(--color-muted)] focus:border-[rgba(196,160,255,0.45)]"
            />
          </Field>

          {fieldErr && <p className="text-sm text-[var(--color-sell)]">{fieldErr}</p>}
          {saved && !fieldErr && (
            <p className="text-sm text-[var(--color-buy)]">Saved.</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="btn-metal rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
          {label}
        </span>
        {hint && <span className="text-xs text-[var(--color-muted)]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
