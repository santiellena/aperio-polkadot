import { createPublicClient, http, defineChain } from "viem";
import { getConfig } from "./config.mjs";

let publicClient = null;

function hubChain(rpcUrl) {
  return defineChain({
    id: 420420417,
    name: "Polkadot Hub TestNet",
    nativeCurrency: { name: "Paseo", symbol: "PAS", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

export function getPublicClient() {
  if (publicClient) return publicClient;
  const cfg = getConfig();
  publicClient = createPublicClient({
    chain: hubChain(cfg.ethRpcUrl),
    transport: http(cfg.ethRpcUrl),
  });
  return publicClient;
}
