import { deployments } from "./deployments";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const LEGACY_EVM_REGISTRY_ADDRESS = "0x253028394517e27a6d22233e94b5b53c62926940";

const registryKind = import.meta.env.VITE_APERIO_REGISTRY_KIND || "evm";
const defaultDeploymentAddress =
	registryKind === "evm"
		? LEGACY_EVM_REGISTRY_ADDRESS
		: deployments.pvm;

export const DEFAULT_REGISTRY_ADDRESS =
	import.meta.env.VITE_APERIO_REGISTRY_ADDRESS ||
	defaultDeploymentAddress ||
	null;

export const DEFAULT_REPO_ORGANIZATION = import.meta.env.VITE_APERIO_REPO_ORGANIZATION || "";
export const DEFAULT_REPO_NAME = import.meta.env.VITE_APERIO_REPO_NAME || "";

export const BUNDLE_GATEWAY_BASE =
	(import.meta.env.VITE_APERIO_BUNDLE_GATEWAY || "https://paseo-ipfs.polkadot.io/ipfs").replace(
		/\/$/,
		"",
	);
