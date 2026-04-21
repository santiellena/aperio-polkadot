import { formatEther, keccak256, toBytes, type Hex } from "viem";
import { BUNDLE_GATEWAY_BASE } from "./constants";

export function deriveRepoId(organization: string, repository: string): Hex {
	return keccak256(toBytes(`${organization}/${repository}`));
}

export function normalizeRepoSlugPart(value: string) {
	return value.trim();
}

export function isValidRepoSlugPart(value: string) {
	return value.trim().length > 0 && !value.includes("/");
}

export function formatGitCommitHash(value: string) {
	if (!value) return value;
	const body = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
	if (!/^[0-9a-fA-F]+$/.test(body)) {
		return value;
	}
	if (/^0{24}[0-9a-fA-F]{40}$/.test(body)) {
		return body.slice(24).toLowerCase();
	}
	return body.toLowerCase();
}

export function gitCommitHashToBytes32(value: string): Hex {
	const trimmed = value.trim();
	const body =
		trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed;
	if (!/^[0-9a-fA-F]+$/.test(body)) {
		throw new Error("Commit hash must be hexadecimal");
	}
	if (body.length === 40) {
		return `0x${body.padStart(64, "0").toLowerCase()}` as Hex;
	}
	if (body.length === 64) {
		return `0x${body.toLowerCase()}` as Hex;
	}
	throw new Error("Commit hash must be 40 or 64 hex characters");
}

export function shortenHash(value: string, chars = 8) {
	if (value.length <= chars * 2) return value;
	return `${value.slice(0, chars + 2)}…${value.slice(-chars)}`;
}

export function shortenAddress(value: string) {
	return value;
}

export function formatRepoTimestamp(timestamp: number | null) {
	if (!timestamp) return "Unknown";
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(timestamp * 1000));
}

export function formatEthAmount(value: bigint | null) {
	if (value === null) return "Unavailable";
	return `${formatEther(value)} UNIT`;
}

export function buildBundleUrl(cid: string) {
	if (!cid) return null;
	return `${BUNDLE_GATEWAY_BASE}/${cid}`;
}
