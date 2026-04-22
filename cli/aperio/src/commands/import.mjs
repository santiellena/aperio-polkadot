import { signerFromSuri } from "../lib/user-signer.mjs";
import { writeSession } from "../lib/session.mjs";
import { deriveH160, isAccountMapped } from "../lib/revive.mjs";
import { bytesToHex } from "../lib/hex.mjs";
import { getConfig } from "../lib/config.mjs";

export async function importCommand(suri) {
  if (!suri || suri.length === 0) {
    throw new Error(
      "Missing SURI argument. Examples:\n" +
        '  aperio import "//Alice"\n' +
        '  aperio import "word1 word2 ... word12"\n' +
        '  aperio import "word1 word2 ... word12//MyAccount"\n' +
        "  aperio import 0x<64-hex-chars>",
    );
  }

  const signer = signerFromSuri(suri);
  const h160 = deriveH160(signer.publicKey);

  const cfg = getConfig();
  await writeSession({
    backend: "suri",
    created_at_unix_secs: Math.floor(Date.now() / 1000),
    address: signer.address,
    public_key_hex: bytesToHex(signer.publicKey),
    h160,
    suri,
  });

  let mapped = "unknown";
  try {
    mapped = (await isAccountMapped(h160)) ? "mapped" : "NOT mapped — run `aperio map`";
  } catch (err) {
    mapped = `check failed (${err instanceof Error ? err.message : err})`;
  }

  process.stdout.write("Signer imported.\n");
  process.stdout.write(`  Substrate account : ${signer.address}\n`);
  process.stdout.write(`  EVM address (H160): ${h160}\n`);
  process.stdout.write(`  Mapping status    : ${mapped}\n`);
  process.stdout.write(`  Saved to          : ${cfg.sessionPath}\n`);
  process.stderr.write(
    "\nWARNING: the SURI is stored in plaintext at the path above. " +
      "For testnet dev accounts this is fine; for a real key, prefer the " +
      "APERIO_SIGNER_SURI environment variable instead of `aperio import`.\n",
  );
}
