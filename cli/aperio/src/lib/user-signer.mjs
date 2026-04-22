import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
  parseSuri,
  ss58Address,
  validateMnemonic,
} from "@polkadot-labs/hdkd-helpers";
import { getPolkadotSigner } from "polkadot-api/signer";
import { readSession } from "./session.mjs";

const HEX_SEED_RE = /^0x[0-9a-fA-F]{64}$/;

function miniSecretAndPathFromSuri(suri) {
  const trimmed = suri.trim();
  if (!trimmed) throw new Error("Empty SURI.");

  if (HEX_SEED_RE.test(trimmed)) {
    return { miniSecret: new Uint8Array(Buffer.from(trimmed.slice(2), "hex")), path: "" };
  }

  // `parseSuri` only recognises the `<phrase>[<paths>]` shape. A bare "//Alice"
  // (no phrase) slips through as `{}`, so handle that form explicitly.
  const parsed = parseSuri(trimmed);
  const pathOnly = trimmed.startsWith("/") ? trimmed : parsed.paths ?? "";
  const phrase = parsed.phrase && parsed.phrase.length > 0 ? parsed.phrase : DEV_PHRASE;
  if (phrase !== DEV_PHRASE && !validateMnemonic(phrase)) {
    throw new Error(`Invalid mnemonic phrase (expected a valid BIP39 12/24-word phrase).`);
  }
  const entropy = mnemonicToEntropy(phrase);
  const miniSecret = entropyToMiniSecret(entropy);
  return { miniSecret, path: pathOnly };
}

export function signerFromSuri(suri) {
  const { miniSecret, path } = miniSecretAndPathFromSuri(suri);
  const derive = sr25519CreateDerive(miniSecret);
  const keypair = derive(path);
  return {
    address: ss58Address(keypair.publicKey),
    publicKey: keypair.publicKey,
    polkadotSigner: getPolkadotSigner(keypair.publicKey, "Sr25519", keypair.sign),
  };
}

async function resolveSuri() {
  const fromEnv = process.env.APERIO_SIGNER_SURI;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  const session = await readSession();
  if (!session || !session.suri) {
    throw new Error(
      "No signer configured. Run `aperio import <suri>` or set APERIO_SIGNER_SURI " +
        '(examples: "//Alice", a 12-word mnemonic, or a 0x-prefixed 32-byte seed).',
    );
  }
  return session.suri;
}

export async function withUserSigner(fn) {
  const suri = await resolveSuri();
  const signer = signerFromSuri(suri);
  return fn(signer);
}
