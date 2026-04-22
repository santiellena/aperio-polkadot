import { keccak256, toBytes, isAddress } from "viem";

export function deriveRepoId(organization, name) {
  return keccak256(toBytes(`${organization}/${name}`));
}

export function gitCommitHashToBytes32(value) {
  const trimmed = String(value ?? "").trim();
  const body =
    trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-fA-F]+$/.test(body)) {
    throw new Error("Commit hash must be hex");
  }
  if (body.length === 40) return `0x${body.padStart(64, "0").toLowerCase()}`;
  if (body.length === 64) return `0x${body.toLowerCase()}`;
  throw new Error("Commit hash must be 40 (SHA-1) or 64 (SHA-256) hex chars");
}

export function normalizeSlug(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed.includes("/")) {
    throw new Error(`Slug segment is empty or contains '/': "${value}"`);
  }
  return trimmed;
}

export function requireEthAddress(value, label = "address") {
  const trimmed = String(value ?? "").trim();
  if (!isAddress(trimmed)) throw new Error(`${label} is not a valid EVM address: ${value}`);
  return trimmed;
}

export function shorten(value, chars = 6) {
  if (!value) return "";
  if (value.length <= chars * 2 + 2) return value;
  return `${value.slice(0, chars + 2)}…${value.slice(-chars)}`;
}
