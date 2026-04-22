import { encodeFunctionData, keccak256 } from "viem";
import { getConfig } from "./config.mjs";
import { Binary, FixedSizeBinary, getClient, submitAndWait } from "./chain.mjs";
import { bytesToHex } from "./hex.mjs";

// Generous fixed limits. pallet-revive will refund the unused weight / deposit.
const WEIGHT_LIMIT = { ref_time: 500_000_000_000n, proof_size: 5_000_000n };
const STORAGE_DEPOSIT_LIMIT = 10_000_000_000_000n;

/**
 * H160 address derived from an sr25519 public key per pallet-revive's
 * default fallback. Once `Revive.map_account` is called, this address
 * becomes the on-chain msg.sender for contract calls signed by the account.
 */
export function deriveH160(publicKey) {
  return `0x${keccak256(publicKey).slice(-40)}`;
}

export async function isAccountMapped(h160) {
  const cfg = getConfig();
  const api = getClient(cfg.wsUrl).getUnsafeApi();
  // `OriginalAccount` is the canonical H160 → AccountId registry populated by
  // `Revive.map_account`. `AccountInfoOf` only appears once the account holds
  // contract state or dust, so it gives false negatives for mapped-but-idle keys.
  const original = await api.query.Revive.OriginalAccount.getValue(FixedSizeBinary.fromHex(h160));
  return original !== undefined;
}

export async function mapAccount(polkadotSigner) {
  const cfg = getConfig();
  const api = getClient(cfg.wsUrl).getUnsafeApi();
  const tx = api.tx.Revive.map_account();
  return submitAndWait(tx, polkadotSigner);
}

/**
 * Submit a contract call on pallet-revive, signed by the provided PolkadotSigner.
 * The contract sees msg.sender = the mapped H160 (or the keccak-prefixed fallback
 * if the account hasn't been mapped yet).
 */
export async function execContract({ address, abi, functionName, args = [], value = 0n }, polkadotSigner) {
  const cfg = getConfig();
  const api = getClient(cfg.wsUrl).getUnsafeApi();
  const calldata = encodeFunctionData({ abi, functionName, args });
  const tx = api.tx.Revive.call({
    dest: FixedSizeBinary.fromHex(address),
    value,
    weight_limit: WEIGHT_LIMIT,
    storage_deposit_limit: STORAGE_DEPOSIT_LIMIT,
    data: Binary.fromHex(calldata),
  });
  return submitAndWait(tx, polkadotSigner);
}

export { bytesToHex };
