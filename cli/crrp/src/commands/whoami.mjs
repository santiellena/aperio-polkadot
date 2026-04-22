import { readSession } from "../lib/session.mjs";
import { signerFromSuri } from "../lib/user-signer.mjs";
import { deriveH160, isAccountMapped } from "../lib/revive.mjs";
import { getConfig } from "../lib/config.mjs";

export async function whoamiCommand() {
  const cfg = getConfig();

  let address;
  let publicKey;
  let source;
  if (process.env.CRRP_SIGNER_SURI) {
    const signer = signerFromSuri(process.env.CRRP_SIGNER_SURI);
    address = signer.address;
    publicKey = signer.publicKey;
    source = "CRRP_SIGNER_SURI env var";
  } else {
    const session = await readSession();
    if (!session || !session.suri) {
      throw new Error("No signer configured. Run `crrp import <suri>` first.");
    }
    const signer = signerFromSuri(session.suri);
    address = signer.address;
    publicKey = signer.publicKey;
    source = cfg.sessionPath;
  }

  const h160 = deriveH160(publicKey);
  let mapped;
  try {
    mapped = (await isAccountMapped(h160)) ? "mapped" : "NOT mapped";
  } catch (err) {
    mapped = `check failed: ${err instanceof Error ? err.message : err}`;
  }

  process.stdout.write(`Substrate account : ${address}\n`);
  process.stdout.write(`EVM address (H160): ${h160}\n`);
  process.stdout.write(`Revive mapping    : ${mapped}\n`);
  process.stdout.write(`Registry          : ${cfg.registryAddress}\n`);
  process.stdout.write(`WS URL            : ${cfg.wsUrl}\n`);
  process.stdout.write(`Signer source     : ${source}\n`);
}
