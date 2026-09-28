// Registry for the RainbowKit connect modal. AuthContext lives outside the
// kit's hooks this way — and the injected-only build (no WalletConnect id)
// never touches RainbowKitProvider at all.
let openFn: (() => void) | null = null;

export function setConnectModal(fn: (() => void) | null) {
  openFn = fn;
}

export function walletModalAvailable(): boolean {
  return openFn != null;
}

export function openWalletModal(): void {
  openFn?.();
}
