import { deployments } from "./deployments";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const DEFAULT_REGISTRY_ADDRESS =
	import.meta.env.VITE_CRRP_REGISTRY_ADDRESS || deployments.evm || null;

export const DEFAULT_REPO_ORGANIZATION = import.meta.env.VITE_CRRP_REPO_ORGANIZATION || "";
export const DEFAULT_REPO_NAME = import.meta.env.VITE_CRRP_REPO_NAME || "";

export const BUNDLE_GATEWAY_BASE =
	(import.meta.env.VITE_CRRP_BUNDLE_GATEWAY || "https://paseo-ipfs.polkadot.io/ipfs").replace(
		/\/$/,
		"",
	);
