import {
	formatEther,
	keccak256,
	parseAbiItem,
	toBytes,
	type Address,
	type Hex,
} from "viem";
import { getPublicClient } from "../config/evm";
import { BUNDLE_GATEWAY_BASE, DEFAULT_REGISTRY_ADDRESS, ZERO_ADDRESS } from "../config/crrp";
import { getStoredEthRpcUrl } from "../config/network";

export const crrpRegistryAbi = [
	{
		type: "function",
		name: "getRepo",
		inputs: [{ name: "repoId", type: "bytes32" }],
		outputs: [
			{ name: "maintainer", type: "address" },
			{ name: "headCommit", type: "bytes32" },
			{ name: "headCid", type: "string" },
			{ name: "proposalCount", type: "uint256" },
			{ name: "releaseCount", type: "uint256" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getRepoMetadata",
		inputs: [{ name: "repoId", type: "bytes32" }],
		outputs: [
			{ name: "organization", type: "string" },
			{ name: "name", type: "string" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getProposal",
		inputs: [
			{ name: "repoId", type: "bytes32" },
			{ name: "proposalId", type: "uint256" },
		],
		outputs: [
			{ name: "contributor", type: "address" },
			{ name: "proposedCommit", type: "bytes32" },
			{ name: "proposedCid", type: "string" },
			{ name: "approvals", type: "uint256" },
			{ name: "rejections", type: "uint256" },
			{ name: "status", type: "uint8" },
			{ name: "mergedCommit", type: "bytes32" },
			{ name: "mergedCid", type: "string" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getRepoIncentiveTreasury",
		inputs: [{ name: "repoId", type: "bytes32" }],
		outputs: [{ name: "treasury", type: "address" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "hasContributorRole",
		inputs: [
			{ name: "repoId", type: "bytes32" },
			{ name: "account", type: "address" },
		],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "hasReviewerRole",
		inputs: [
			{ name: "repoId", type: "bytes32" },
			{ name: "account", type: "address" },
		],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
] as const;

export const crrpTreasuryAbi = [
	{
		type: "function",
		name: "donate",
		inputs: [{ name: "repoId", type: "bytes32" }],
		outputs: [],
		stateMutability: "payable",
	},
	{
		type: "function",
		name: "getRepoBalance",
		inputs: [{ name: "repoId", type: "bytes32" }],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getPayoutConfig",
		inputs: [{ name: "repoId", type: "bytes32" }],
		outputs: [
			{ name: "contributionReward", type: "uint256" },
			{ name: "reviewReward", type: "uint256" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getRepoTotalClaimable",
		inputs: [{ name: "repoId", type: "bytes32" }],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getRepoUnfundedClaimable",
		inputs: [{ name: "repoId", type: "bytes32" }],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
] as const;

const repoCreatedEvent = parseAbiItem(
	"event RepoCreated(bytes32 indexed repoId, address indexed maintainer, bytes32 indexed headCommit, string organization, string name, string headCid)",
);
const proposalMergedEvent = parseAbiItem(
	"event ProposalMerged(bytes32 indexed repoId, uint256 indexed proposalId, bytes32 indexed finalCommitHash, string finalCid)",
);
const releaseCreatedEvent = parseAbiItem(
	"event ReleaseCreated(bytes32 indexed repoId, bytes32 indexed commitHash, string version, string cid)",
);

type RepoReadResult = readonly [Address, Hex, string, bigint, bigint];
type RepoMetadataReadResult = readonly [string, string];
type ProposalReadResult = readonly [Address, Hex, string, bigint, bigint, number, Hex, string];

export type RepoListItem = {
	repoId: Hex;
	organization: string;
	repository: string;
	maintainer: Address;
	headCommit: Hex;
	headCid: string;
	createdAt: number | null;
	blockNumber: bigint | null;
};

export type RepoRoleSet = {
	isMaintainer: boolean;
	isContributor: boolean;
	isReviewer: boolean;
};

export type RepoHistoryEntry = {
	type: "initial" | "merge";
	commitHash: Hex;
	cid: string;
	actor: Address;
	timestamp: number | null;
	blockNumber: bigint | null;
	proposalId: bigint | null;
};

export type RepoRelease = {
	version: string;
	commitHash: Hex;
	cid: string;
	timestamp: number | null;
	blockNumber: bigint | null;
};

export type RepoOverview = {
	repoId: Hex;
	organization: string;
	repository: string;
	registryAddress: Address;
	treasuryAddress: Address | null;
	maintainer: Address;
	latestCommitHash: Hex;
	latestCid: string;
	proposalCount: bigint;
	releaseCount: bigint;
	roles: RepoRoleSet;
	treasuryBalance: bigint | null;
	contributionReward: bigint | null;
	reviewReward: bigint | null;
	totalClaimable: bigint | null;
	unfundedClaimable: bigint | null;
	commitList: RepoHistoryEntry[];
	releases: RepoRelease[];
	cloneUrl: string | null;
};

const blockTimestampCache = new Map<string, number>();

function getRegistryAddress(): Address {
	if (!DEFAULT_REGISTRY_ADDRESS) {
		throw new Error("CRRP registry address is not configured");
	}
	return DEFAULT_REGISTRY_ADDRESS as Address;
}

async function getBlockTimestamp(blockNumber: bigint): Promise<number | null> {
	const cacheKey = blockNumber.toString();
	if (blockTimestampCache.has(cacheKey)) {
		return blockTimestampCache.get(cacheKey) ?? null;
	}

	const block = await getPublicClient(getStoredEthRpcUrl()).getBlock({ blockNumber });
	const timestamp = Number(block.timestamp);
	blockTimestampCache.set(cacheKey, timestamp);
	return timestamp;
}

export function deriveRepoId(organization: string, repository: string): Hex {
	return keccak256(toBytes(`${organization}/${repository}`));
}

export function normalizeRepoSlugPart(value: string) {
	return value.trim();
}

export function isValidRepoSlugPart(value: string) {
	return value.trim().length > 0 && !value.includes("/");
}

export function shortenHash(value: string, chars = 8) {
	if (value.length <= chars * 2) return value;
	return `${value.slice(0, chars + 2)}…${value.slice(-chars)}`;
}

export function shortenAddress(value: string) {
	return `${value.slice(0, 6)}…${value.slice(-4)}`;
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

export async function listRepos(): Promise<RepoListItem[]> {
	const client = getPublicClient(getStoredEthRpcUrl());
	const logs = await client.getLogs({
		address: getRegistryAddress(),
		event: repoCreatedEvent,
		fromBlock: 0n,
		toBlock: "latest",
	});

	const items = await Promise.all(
		logs.map(async (log) => ({
			repoId: log.args.repoId as Hex,
			organization: log.args.organization ?? "",
			repository: log.args.name ?? "",
			maintainer: log.args.maintainer as Address,
			headCommit: log.args.headCommit as Hex,
			headCid: log.args.headCid ?? "",
			createdAt: log.blockNumber ? await getBlockTimestamp(log.blockNumber) : null,
			blockNumber: log.blockNumber ?? null,
		})),
	);

	return items.sort((left, right) => Number((right.blockNumber ?? 0n) - (left.blockNumber ?? 0n)));
}

async function readRepoRoles(repoId: Hex, account?: Address): Promise<RepoRoleSet> {
	if (!account) {
		return { isMaintainer: false, isContributor: false, isReviewer: false };
	}

	const client = getPublicClient(getStoredEthRpcUrl());
	const [repo, isContributor, isReviewer] = await Promise.all([
		client.readContract({
			address: getRegistryAddress(),
			abi: crrpRegistryAbi,
			functionName: "getRepo",
			args: [repoId],
		}) as Promise<RepoReadResult>,
		client.readContract({
			address: getRegistryAddress(),
			abi: crrpRegistryAbi,
			functionName: "hasContributorRole",
			args: [repoId, account],
		}) as Promise<boolean>,
		client.readContract({
			address: getRegistryAddress(),
			abi: crrpRegistryAbi,
			functionName: "hasReviewerRole",
			args: [repoId, account],
		}) as Promise<boolean>,
	]);

	return {
		isMaintainer: repo[0].toLowerCase() === account.toLowerCase(),
		isContributor,
		isReviewer,
	};
}

export async function readRepoHistory(repoId: Hex): Promise<RepoHistoryEntry[]> {
	const client = getPublicClient(getStoredEthRpcUrl());
	const [createdLogs, mergedLogs] = await Promise.all([
		client.getLogs({
			address: getRegistryAddress(),
			event: repoCreatedEvent,
			args: { repoId },
			fromBlock: 0n,
			toBlock: "latest",
		}),
		client.getLogs({
			address: getRegistryAddress(),
			event: proposalMergedEvent,
			args: { repoId },
			fromBlock: 0n,
			toBlock: "latest",
		}),
	]);

	const initialEntries = await Promise.all(
		createdLogs.map(async (log) => ({
			type: "initial" as const,
			commitHash: log.args.headCommit as Hex,
			cid: log.args.headCid ?? "",
			actor: log.args.maintainer as Address,
			timestamp: log.blockNumber ? await getBlockTimestamp(log.blockNumber) : null,
			blockNumber: log.blockNumber ?? null,
			proposalId: null,
		})),
	);

	const mergeEntries = await Promise.all(
		mergedLogs.map(async (log) => {
			const proposal = (await client.readContract({
				address: getRegistryAddress(),
				abi: crrpRegistryAbi,
				functionName: "getProposal",
				args: [repoId, log.args.proposalId ?? 0n],
			})) as ProposalReadResult;

			return {
				type: "merge" as const,
				commitHash: log.args.finalCommitHash as Hex,
				cid: log.args.finalCid ?? "",
				actor: proposal[0],
				timestamp: log.blockNumber ? await getBlockTimestamp(log.blockNumber) : null,
				blockNumber: log.blockNumber ?? null,
				proposalId: log.args.proposalId ?? null,
			};
		}),
	);

	return [...initialEntries, ...mergeEntries].sort(
		(left, right) => Number((right.blockNumber ?? 0n) - (left.blockNumber ?? 0n)),
	);
}

export async function readRepoReleases(repoId: Hex): Promise<RepoRelease[]> {
	const client = getPublicClient(getStoredEthRpcUrl());
	const logs = await client.getLogs({
		address: getRegistryAddress(),
		event: releaseCreatedEvent,
		args: { repoId },
		fromBlock: 0n,
		toBlock: "latest",
	});

	const releases = await Promise.all(
		logs.map(async (log) => ({
			version: log.args.version ?? "",
			commitHash: log.args.commitHash as Hex,
			cid: log.args.cid ?? "",
			timestamp: log.blockNumber ? await getBlockTimestamp(log.blockNumber) : null,
			blockNumber: log.blockNumber ?? null,
		})),
	);

	return releases.sort((left, right) => Number((right.blockNumber ?? 0n) - (left.blockNumber ?? 0n)));
}

export async function readRepoOverview(
	organization: string,
	repository: string,
	account?: Address,
): Promise<RepoOverview> {
	const repoId = deriveRepoId(organization, repository);
	const client = getPublicClient(getStoredEthRpcUrl());
	const registryAddress = getRegistryAddress();
	const [repo, metadata, treasuryAddressRaw, history, releases, roles] = await Promise.all([
		client.readContract({
			address: registryAddress,
			abi: crrpRegistryAbi,
			functionName: "getRepo",
			args: [repoId],
		}) as Promise<RepoReadResult>,
		client.readContract({
			address: registryAddress,
			abi: crrpRegistryAbi,
			functionName: "getRepoMetadata",
			args: [repoId],
		}) as Promise<RepoMetadataReadResult>,
		client.readContract({
			address: registryAddress,
			abi: crrpRegistryAbi,
			functionName: "getRepoIncentiveTreasury",
			args: [repoId],
		}) as Promise<Address>,
		readRepoHistory(repoId),
		readRepoReleases(repoId),
		readRepoRoles(repoId, account),
	]);

	const treasuryAddress =
		treasuryAddressRaw && treasuryAddressRaw !== ZERO_ADDRESS ? treasuryAddressRaw : null;

	const treasuryData = treasuryAddress
		? await Promise.all([
				client.readContract({
					address: treasuryAddress,
					abi: crrpTreasuryAbi,
					functionName: "getRepoBalance",
					args: [repoId],
				}) as Promise<bigint>,
				client.readContract({
					address: treasuryAddress,
					abi: crrpTreasuryAbi,
					functionName: "getPayoutConfig",
					args: [repoId],
				}) as Promise<readonly [bigint, bigint]>,
				client.readContract({
					address: treasuryAddress,
					abi: crrpTreasuryAbi,
					functionName: "getRepoTotalClaimable",
					args: [repoId],
				}) as Promise<bigint>,
				client.readContract({
					address: treasuryAddress,
					abi: crrpTreasuryAbi,
					functionName: "getRepoUnfundedClaimable",
					args: [repoId],
				}) as Promise<bigint>,
			])
		: null;

	return {
		repoId,
		organization: metadata[0] || organization,
		repository: metadata[1] || repository,
		registryAddress,
		treasuryAddress,
		maintainer: repo[0],
		latestCommitHash: repo[1],
		latestCid: repo[2],
		proposalCount: repo[3],
		releaseCount: repo[4],
		roles,
		treasuryBalance: treasuryData?.[0] ?? null,
		contributionReward: treasuryData?.[1]?.[0] ?? null,
		reviewReward: treasuryData?.[1]?.[1] ?? null,
		totalClaimable: treasuryData?.[2] ?? null,
		unfundedClaimable: treasuryData?.[3] ?? null,
		commitList: history,
		releases,
		cloneUrl: buildBundleUrl(repo[2]),
	};
}
