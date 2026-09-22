"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";
import { verifyMessage } from "viem";
import { supabase, type UserRow } from "@/lib/supabase";
import type { ProfileInput } from "@/lib/profile";
import {
  actionMessage,
  clearSession,
  loadSession,
  loginMessage,
  saveSession,
  sessionFresh,
  USERNAME_RE,
} from "@/lib/auth";

export type AuthStatus =
  | "idle"
  | "connecting"
  | "needs_verify"
  | "signing"
  | "needs_username"
  | "ready";

type AuthValue = {
  status: AuthStatus;
  address?: `0x${string}`;
  username: string | null;
  row: UserRow | null;
  error: string | null;
  connect: () => void;
  verify: (addr?: `0x${string}`) => Promise<void>;
  // Fresh action-bound signature (action + order id) for payment marks and
  // PII reads — never satisfied by the 24h login proof alone.
  signAction: (
    action: string,
    orderId: number,
  ) => Promise<{ wallet: string; iso: string; signature: string } | null>;
  submitUsername: (u: string) => Promise<boolean>;
  saveProfile: (p: ProfileInput) => Promise<string | null>;
  setAvatar: (url: string | null) => void;
  disconnect: () => void;
  clearError: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const [status, setStatus] = useState<AuthStatus>("idle");
  const [username, setUsername] = useState<string | null>(null);
  const [row, setRow] = useState<UserRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  // The verified login signature — reused as an upload proof so avatar
  // changes don't need a second wallet popup.
  const proofRef = useRef<{ iso: string; signature: string; v?: number } | null>(null);

  // Persist the session, keeping the existing proof if this one has none.
  const persist = useCallback((wallet: string, name: string | null) => {
    const prior = loadSession();
    saveSession({
      wallet,
      username: name,
      verifiedAt: Date.now(),
      proof:
        proofRef.current ??
        (prior?.wallet === wallet ? prior.proof : undefined),
    });
  }, []);

  const fetchUser = useCallback(async (wallet: string): Promise<UserRow | null> => {
    if (!supabase) return null;
    const { data, error: err } = await supabase
      .from("users")
      .select("*")
      .eq("wallet", wallet)
      .maybeSingle();
    if (err) throw err;
    return (data as UserRow | null) ?? null;
  }, []);

  // After a verified signature (or a fresh stored session), sync the row.
  // Writes go through /api/profile (service role + signature check) — anon
  // keys can no longer write public.users. Username is never overwritten
  // by login.
  const applyVerified = useCallback(
    async (addr: `0x${string}`, signatureVerified: boolean) => {
      const wallet = addr.toLowerCase();
      if (!supabase) {
        // Supabase not configured — still allow a signed session.
        setUsername(null);
        persist(wallet, null);
        setStatus("needs_username");
        return;
      }
      let row: UserRow | null = null;
      if (signatureVerified && proofRef.current) {
        // The signature we just collected IS the login proof for touch.
        try {
          const res = await fetch("/api/profile", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "touch",
              wallet,
              iso: proofRef.current.iso,
              signature: proofRef.current.signature,
            }),
          });
          const j = await res.json();
          if (j.ok) row = j.row as UserRow;
        } catch {
          /* fall back to read-only */
        }
      }
      if (!row) row = await fetchUser(wallet);
      const name = row?.username ?? null;
      setRow(row);
      setUsername(name);
      persist(wallet, name);
      setStatus(name ? "ready" : "needs_username");
    },
    [fetchUser, persist],
  );

  const verify = useCallback(
    async (addr?: `0x${string}`) => {
      const a = addr ?? address;
      if (!a || busy.current) return;
      busy.current = true;
      setError(null);
      setStatus("signing");
      try {
        const iso = new Date().toISOString();
        const message = loginMessage(a, iso);
        const signature = await signMessageAsync({ message });
        const ok = await verifyMessage({ address: a, message, signature });
        if (!ok) throw new Error("Signature did not match this address.");
        proofRef.current = { iso, signature, v: 2 };
        await applyVerified(a, true);
      } catch (e) {
        const msg = (e as { shortMessage?: string; message?: string }).shortMessage
          ?? (e as Error).message;
        setError(
          /reject|denied|cancel/i.test(msg)
            ? "Signature request rejected."
            : `Sign-in failed: ${msg}`,
        );
        setStatus("needs_verify");
      } finally {
        busy.current = false;
      }
    },
    [address, signMessageAsync, applyVerified],
  );

  // Wallet connected → resume a fresh session, or ask for a signature.
  // Never fire personal_sign without a user gesture: a popup-less request
  // gets auto-rejected by some wallets and reads as a phantom rejection.
  useEffect(() => {
    if (!isConnected || !address) {
      setStatus("idle");
      setUsername(null);
      setRow(null);
      return;
    }
    const wallet = address.toLowerCase();
    const session = loadSession();
    if (session && session.wallet === wallet && sessionFresh(session)) {
      // Fresh session — refresh username from the DB in the background.
      applyVerified(address, false).catch(() => setStatus("ready"));
      return;
    }
    if (status !== "signing" && status !== "needs_username" && status !== "ready") {
      setStatus("needs_verify");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  const connect = useCallback(() => {
    setError(null);
    const injected = connectors[0];
    if (!injected) {
      setError("No injected wallet found. Install MetaMask or Rabby.");
      return;
    }
    setStatus("connecting");
    connectAsync({ connector: injected })
      .then((res) => {
        // Chain straight into the signature while we're still in the user's
        // click context. Address state may lag — use the connector's account.
        const a = res.accounts?.[0] as `0x${string}` | undefined;
        if (a) {
          verify(a);
        } else {
          setStatus("needs_verify");
        }
      })
      .catch((e) => {
        setError(
          /reject|denied|cancel/i.test((e as Error).message)
            ? "Connection request rejected."
            : `Connect failed: ${(e as Error).message}`,
        );
        setStatus("idle");
      });
  }, [connectAsync, connectors, verify]);

  // Fresh action-bound signature — required by pay + shipment endpoints.
  const signAction = useCallback(
    async (action: string, orderId: number) => {
      if (!address) return null;
      try {
        const iso = new Date().toISOString();
        const signature = await signMessageAsync({
          message: actionMessage(action, address, orderId, iso),
        });
        return { wallet: address.toLowerCase(), iso, signature };
      } catch {
        return null;
      }
    },
    [address, signMessageAsync],
  );

  // Shared write path for profile fields: stored login proof → /api/profile.
  const profileSave = useCallback(
    async (fields: Record<string, unknown>): Promise<string | null> => {
      const stored = loadSession()?.proof;
      const p = proofRef.current ?? (stored?.v === 2 ? stored : null);
      if (!p || !address) return "No verified session — sign in again.";
      try {
        const res = await fetch("/api/profile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "save",
            wallet: address.toLowerCase(),
            iso: p.iso,
            signature: p.signature,
            fields,
          }),
        });
        const j = await res.json();
        if (!j.ok) return j.error ?? "Could not save.";
        if (j.row) setRow(j.row as UserRow);
        return null;
      } catch {
        return "Could not reach the server.";
      }
    },
    [address],
  );

  const submitUsername = useCallback(
    async (u: string): Promise<boolean> => {
      const trimmed = u.trim();
      if (!USERNAME_RE.test(trimmed)) {
        setError("3–16 chars: letters, numbers, underscore only.");
        return false;
      }
      if (!address) return false;
      if (!supabase) {
        setError("Account storage is not configured.");
        return false;
      }
      setError(null);
      const wallet = address.toLowerCase();
      const err = await profileSave({ username: trimmed });
      if (err) {
        setError(err);
        return false;
      }
      setUsername(trimmed);
      persist(wallet, trimmed);
      setStatus("ready");
      return true;
    },
    [address, persist, profileSave, supabase],
  );

  // Profile page save — validated server-side on the signer's own row.
  const saveProfile = useCallback(
    async (p: ProfileInput): Promise<string | null> => {
      if (!address) return "Not connected.";
      const err = await profileSave({
        username: p.username,
        bio: p.bio,
        x_url: p.x_url,
        telegram_url: p.telegram_url,
        website_url: p.website_url,
      });
      if (err) return err;
      setUsername(p.username);
      persist(address.toLowerCase(), p.username);
      return null;
    },
    [address, persist, profileSave],
  );

  // Avatar updates happen server-side (/api/avatar); this just syncs the row.
  const setAvatar = useCallback((url: string | null) => {
    setRow((r) => (r ? { ...r, avatar_url: url } : r));
  }, []);

  const disconnect = useCallback(() => {
    clearSession();
    proofRef.current = null;
    setUsername(null);
    setRow(null);
    setError(null);
    setStatus("idle");
    wagmiDisconnect();
  }, [wagmiDisconnect]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        status,
        address,
        username,
        row,
        error,
        connect,
        verify,
        signAction,
        submitUsername,
        saveProfile,
        setAvatar,
        disconnect,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
