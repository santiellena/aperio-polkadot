export function bytesToHex(bytes) {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

export function hexToBytes(hex) {
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error(`Invalid hex length: ${hex}`);
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

export function normalizeHex(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) throw new Error("Hex value is empty");
  const body =
    trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-fA-F]+$/.test(body)) throw new Error(`Not a hex string: ${trimmed}`);
  if (body.length % 2 !== 0) throw new Error(`Odd-length hex: ${trimmed}`);
  return `0x${body.toLowerCase()}`;
}
