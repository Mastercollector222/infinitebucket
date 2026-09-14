"use client";

import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { erc20Abi } from "@/lib/abi";
import { TOKEN } from "@/lib/constants";

const base = { address: TOKEN.address, abi: erc20Abi } as const;

// On-chain truth check for name/symbol/decimals/totalSupply. Used to confirm
// the marketing facts against the actual contract on Robinhood Chain.
export function useChainToken() {
  const { data, isLoading, isError } = useReadContracts({
    contracts: [
      { ...base, functionName: "name" },
      { ...base, functionName: "symbol" },
      { ...base, functionName: "decimals" },
      { ...base, functionName: "totalSupply" },
    ],
    query: { staleTime: 60_000 },
  });

  const [name, symbol, decimals, totalSupply] = data ?? [];
  const dec = typeof decimals?.result === "number" ? decimals.result : TOKEN.decimals;
  const supplyRaw = totalSupply?.result as bigint | undefined;

  return {
    isLoading,
    isError,
    name: (name?.result as string | undefined) ?? null,
    symbol: (symbol?.result as string | undefined) ?? null,
    decimals: typeof decimals?.result === "number" ? decimals.result : null,
    totalSupply: supplyRaw != null ? Number(formatUnits(supplyRaw, dec)) : null,
  };
}
