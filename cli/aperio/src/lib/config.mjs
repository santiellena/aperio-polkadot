import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEPLOYMENTS_JSON = path.resolve(__dirname, "../../deployments.json");

export const DEFAULTS = {
  wsUrl: "wss://asset-hub-paseo.dotters.network",
  ethRpcUrl: "https://services.polkadothub-rpc.com/testnet",
  bulletinWs: "wss://paseo-bulletin-rpc.polkadot.io",
  registryKind: "evm",
  registryAddress: "0x253028394517e27a6d22233e94b5b53c62926940",
  bundleGateway: "https://paseo-ipfs.polkadot.io/ipfs",
  stateDir: path.join(os.homedir(), ".aperio"),
};

function readDeployments() {
  try {
    return JSON.parse(fs.readFileSync(DEPLOYMENTS_JSON, "utf-8"));
  } catch {
    return {};
  }
}

export function getConfig() {
  const stateDir = process.env.APERIO_STATE_DIR || DEFAULTS.stateDir;
  const registryKind = process.env.APERIO_REGISTRY_KIND || DEFAULTS.registryKind;
  const deployments = readDeployments();
  const defaultDeploymentAddress =
    registryKind === "evm" ? DEFAULTS.registryAddress : deployments.pvm;

  return {
    wsUrl: process.env.APERIO_WS_URL || DEFAULTS.wsUrl,
    ethRpcUrl: process.env.APERIO_ETH_RPC_URL || DEFAULTS.ethRpcUrl,
    bulletinWs: process.env.APERIO_BULLETIN_WS || DEFAULTS.bulletinWs,
    registryAddress: (
      process.env.APERIO_REGISTRY ||
      defaultDeploymentAddress ||
      DEFAULTS.registryAddress
    ).toLowerCase(),
    bundleGateway: (process.env.APERIO_BUNDLE_GATEWAY || DEFAULTS.bundleGateway).replace(/\/$/, ""),
    registryKind,
    stateDir,
    sessionPath: path.join(stateDir, "session.json"),
  };
}
