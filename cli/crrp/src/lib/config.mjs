import path from "node:path";
import os from "node:os";

export const DEFAULTS = {
  wsUrl: "wss://asset-hub-paseo.dotters.network",
  ethRpcUrl: "https://services.polkadothub-rpc.com/testnet",
  bulletinWs: "wss://paseo-bulletin-rpc.polkadot.io",
  registryAddress: "0x253028394517e27a6d22233e94b5b53c62926940",
  bundleGateway: "https://paseo-ipfs.polkadot.io/ipfs",
  stateDir: path.join(os.homedir(), ".crrp"),
};

export function getConfig() {
  const stateDir = process.env.CRRP_STATE_DIR || DEFAULTS.stateDir;
  return {
    wsUrl: process.env.CRRP_WS_URL || DEFAULTS.wsUrl,
    ethRpcUrl: process.env.CRRP_ETH_RPC_URL || DEFAULTS.ethRpcUrl,
    bulletinWs: process.env.CRRP_BULLETIN_WS || DEFAULTS.bulletinWs,
    registryAddress: (process.env.CRRP_REGISTRY || DEFAULTS.registryAddress).toLowerCase(),
    bundleGateway: (process.env.CRRP_BUNDLE_GATEWAY || DEFAULTS.bundleGateway).replace(/\/$/, ""),
    stateDir,
    sessionPath: path.join(stateDir, "session.json"),
  };
}
