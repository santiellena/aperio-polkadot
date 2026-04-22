import { blake2b } from "blakejs";
import { CID } from "multiformats/cid";
import * as digest from "multiformats/hashes/digest";

const BLAKE2B_256_CODE = 0xb220;
const RAW_CODEC = 0x55;

/**
 * Compute the blake2b-256 hash of bundle bytes and the corresponding IPFS CID v1.
 * Matches the web app's hexHashToCid and hashFileWithBytes.
 */
export function bundleCid(bundleBytes) {
  const hashBytes = blake2b(bundleBytes, undefined, 32);
  const hex = `0x${Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
  const mh = digest.create(BLAKE2B_256_CODE, hashBytes);
  const cid = CID.createV1(RAW_CODEC, mh).toString();
  return { hash: hex, cid };
}
