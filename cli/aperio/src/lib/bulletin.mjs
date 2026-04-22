import fs from "node:fs/promises";
import { getConfig } from "./config.mjs";
import { getClient, Binary, Enum, submitAndWait } from "./chain.mjs";
import { aliceSigner } from "./alice.mjs";

const MAX_BUNDLE_BYTES = 8 * 1024 * 1024;

export async function readBundle(bundlePath) {
  const bytes = await fs.readFile(bundlePath);
  if (bytes.length === 0) throw new Error(`Bundle is empty: ${bundlePath}`);
  if (bytes.length > MAX_BUNDLE_BYTES) {
    const mb = (bytes.length / 1024 / 1024).toFixed(2);
    throw new Error(`Bundle too large (${mb} MiB). Bulletin caps at 8 MiB.`);
  }
  return new Uint8Array(bytes);
}

export async function uploadToBulletin(bundleBytes) {
  const cfg = getConfig();
  const alice = aliceSigner();
  const client = getClient(cfg.bulletinWs);
  const api = client.getUnsafeApi();

  // Best-effort authorization precheck. Fails gracefully if the storage item isn't
  // reachable through the unsafe API — the actual tx will still surface any error.
  try {
    const auth = await api.query.TransactionStorage.Authorizations.getValue(
      Enum("Account", alice.address),
    );
    if (!auth || auth.extent.transactions === 0n || auth.extent.bytes < BigInt(bundleBytes.length)) {
      throw new Error(
        `Bulletin signer ${alice.address} is not authorized for ${bundleBytes.length} bytes`,
      );
    }
  } catch (err) {
    if (err && err.message && err.message.startsWith("Bulletin signer")) throw err;
    // Query shape may differ; continue and let the tx surface the real error.
  }

  const tx = api.tx.TransactionStorage.store({ data: Binary.fromBytes(bundleBytes) });
  return submitAndWait(tx, alice.polkadotSigner);
}
