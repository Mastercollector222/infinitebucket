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
  verify: () => Promise<void>;
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
  const proofRef = useRef<{ iso: string; signature: string } | null>(null);

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
  // SELECT first — an existing row is only touched on `last_seen`; username is
  // never overwritten by login. (supabase-js upsert defaults missing columns
  // to NULL on merge, which would wipe the username every sign-in.)
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
      let row = await fetchUser(wallet);
      if (signatureVerified) {
        const last_seen = new Date().toISOString();
        if (row) {
          await supabase.from("users").update({ last_seen }).eq("wallet", wallet);
        } else {
          const { error: insErr } = await supabase
            .from("users")
            .insert({ wallet, last_seen });
          if (insErr && insErr.code !== "23505") throw insErr;
          // Re-select: gets the fresh row, and covers a rare insert race
          // where another tab created the row between our SELECT and INSERT.
          row = await fetchUser(wallet);
        }
      }
      const name = row?.username ?? null;
      setRow(row);
      setUsername(name);
      persist(wallet, name);
      setStatus(name ? "ready" : "needs_username");
    },
    [fetchUser, persist],
  );

  const verify = useCallback(async () => {
    if (!address || busy.current) return;
    busy.current = true;
    setError(null);
    setStatus("signing");
    try {
      const iso = new Date().toISOString();
      const message = loginMessage(address, iso);
      const signature = await signMessageAsync({ message });
      const ok = await verifyMessage({ address, message, signature });
      if (!ok) throw new Error("Signature did not match this address.");
      proofRef.current = { iso, signature };
      await applyVerified(address, true);
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
  }, [address, signMessageAsync, applyVerified]);

  // Wallet connected → resume fresh session or request a signature.
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
      verify();
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
    connectAsync({ connector: injected }).catch((e) => {
      setError(
        /reject|denied|cancel/i.test((e as Error).message)
          ? "Connection request rejected."
          : `Connect failed: ${(e as Error).message}`,
      );
      setStatus("idle");
    });
  }, [connectAsync, connectors]);

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
      // Claim the name on the existing row — the login flow created/found it.
      const { data: updated, error: err } = await supabase
        .from("users")
        .update({ username: trimmed })
        .eq("wallet", wallet)
        .select("wallet")
        .maybeSingle();
      if (err) {
        setError(
          err.code === "23505"
            ? "That username is taken."
            : `Could not save username: ${err.message}`,
        );
        return false;
      }
      if (!updated) {
        // Row vanished between login and submit — recreate it with the name.
        const { error: insErr } = await supabase
          .from("users")
          .insert({ wallet, username: trimmed });
        if (insErr) {
          setError(
            insErr.code === "23505"
              ? "That username is taken."
              : `Could not save username: ${insErr.message}`,
          );
          return false;
        }
      }
      setUsername(trimmed);
      setRow((r) => (r ? { ...r, username: trimmed } : r));
      persist(wallet, trimmed);
      setStatus("ready");
      return true;
    },
    [address, persist],
  );

  // Profile page save: UPDATE the caller's own row only — never insert.
  const saveProfile = useCallback(
    async (p: ProfileInput): Promise<string | null> => {
      if (!address || !supabase) return "Not connected.";
      const wallet = address.toLowerCase();
      const { error: err } = await supabase
        .from("users")
        .update({
          username: p.username,
          bio: p.bio,
          x_url: p.x_url,
          telegram_url: p.telegram_url,
          website_url: p.website_url,
        })
        .eq("wallet", wallet);
      if (err) {
        return err.code === "23505"
          ? "That username is taken."
          : `Could not save profile: ${err.message}`;
      }
      setUsername(p.username);
      setRow((r) => (r ? { ...r, ...p } : r));
      persist(wallet, p.username);
      return null;
    },
    [address, persist],
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
