import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
  ss58Address,
} from "@polkadot-labs/hdkd-helpers";
import { getPolkadotSigner } from "polkadot-api/signer";

// Bulletin chain uploads use //Alice because she's pre-authorized for storage.
// This matches the web app's behaviour in useSubstrateSession.getBulletinSigner().
const entropy = mnemonicToEntropy(DEV_PHRASE);
const miniSecret = entropyToMiniSecret(entropy);
const derive = sr25519CreateDerive(miniSecret);

export function aliceSigner() {
  const keypair = derive("//Alice");
  return {
    address: ss58Address(keypair.publicKey),
    publicKey: keypair.publicKey,
    polkadotSigner: getPolkadotSigner(keypair.publicKey, "Sr25519", keypair.sign),
  };
}
