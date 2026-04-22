import type { Address } from "viem";
import { BUNDLE_GATEWAY_BASE, DEFAULT_REGISTRY_ADDRESS } from "../../config/aperio";

export const REGISTRY_FROM_BLOCK = BigInt(import.meta.env.VITE_REGISTRY_FROM_BLOCK || "0");
export const LOG_CHUNK_SIZE = BigInt(import.meta.env.VITE_LOG_CHUNK_SIZE || "2000");
export { BUNDLE_GATEWAY_BASE };

export function getRegistryAddress(): Address {
	if (!DEFAULT_REGISTRY_ADDRESS) {
		throw new Error("Aperio registry address is not configured");
	}
	return DEFAULT_REGISTRY_ADDRESS as Address;
}
