"use client";

import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { erc20Abi } from "@/lib/abi";
import { CHAIN, TOKEN } from "@/lib/constants";

// INFINITY balance for the connected account, read on Robinhood Chain.
export function useInfinityBalance() {
  const { address, isConnected } = useAccount();
  const { data, isLoading } = useReadContract({
    address: TOKEN.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: CHAIN.id,
    query: { enabled: Boolean(address), refetchInterval: 20_000 },
  });

  const raw = data as bigint | undefined;
  return {
    isLoading: isConnected && isLoading,
    balance: raw != null ? Number(formatUnits(raw, TOKEN.decimals)) : null,
    raw,
  };
}
