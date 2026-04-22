import type { Address, Hex } from "viem";
import { getPublicClient } from "../../config/evm";
import { getStoredEthRpcUrl } from "../../config/network";
import { ZERO_ADDRESS } from "../../config/aperio";
import { aperioRegistryAbi, aperioTreasuryAbi } from "./abi";
import { getRegistryAddress } from "./constants";
import { buildBundleUrl, deriveRepoId } from "./format";
import type {
	LeaderboardEntry,
	LeaderboardRepoStats,
	LeaderboardSummary,
	ProposalReadResult,
	ProposalTimestampsReadResult,
	RepoHistoryEntry,
	RepoListItem,
	RepoMetadataReadResult,
	RepoOverview,
	RepoProposal,
	RepoReadResult,
	RepoRelease,
	RepoRoleSet,
	RepoTimestampsReadResult,
	ReleaseRecordReadResult,
	RewardStatsReadResult,
} from "./types";

const repoReadCache = new Map<string, Promise<RepoReadResult>>();
const repoMetadataCache = new Map<string, Promise<RepoMetadataReadResult>>();
const repoTimestampsCache = new Map<string, Promise<RepoTimestampsReadResult>>();

async function getRepo(repoId: Hex): Promise<RepoReadResult> {
	const cacheKey = repoId.toLowerCase();
	const cached = repoReadCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const promise = getPublicClient(getStoredEthRpcUrl()).readContract({
		address: getRegistryAddress(),
		abi: aperioRegistryAbi,
		functionName: "getRepo",
		args: [repoId],
	}) as Promise<RepoReadResult>;
	repoReadCache.set(cacheKey, promise);
	return promise;
}

async function getRepoMetadata(repoId: Hex): Promise<RepoMetadataReadResult> {
	const cacheKey = repoId.toLowerCase();
	const cached = repoMetadataCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const promise = getPublicClient(getStoredEthRpcUrl()).readContract({
		address: getRegistryAddress(),
		abi: aperioRegistryAbi,
		functionName: "getRepoMetadata",
		args: [repoId],
	}) as Promise<RepoMetadataReadResult>;
	repoMetadataCache.set(cacheKey, promise);
	return promise;
}

async function getRepoTimestamps(repoId: Hex): Promise<RepoTimestampsReadResult> {
	const cacheKey = repoId.toLowerCase();
	const cached = repoTimestampsCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const promise = getPublicClient(getStoredEthRpcUrl()).readContract({
		address: getRegistryAddress(),
		abi: aperioRegistryAbi,
		functionName: "getRepoTimestamps",
		args: [repoId],
	}) as Promise<RepoTimestampsReadResult>;
	repoTimestampsCache.set(cacheKey, promise);
	return promise;
}

async function getRepoTreasuryAddress(repoId: Hex): Promise<Address | null> {
	const treasuryAddress = (await getPublicClient(getStoredEthRpcUrl()).readContract({
		address: getRegistryAddress(),
		abi: aperioRegistryAbi,
		functionName: "getRepoIncentiveTreasury",
		args: [repoId],
	})) as Address;

	return treasuryAddress && treasuryAddress !== ZERO_ADDRESS ? treasuryAddress : null;
}

async function getRepoTreasurySnapshot(repoId: Hex): Promise<{
	treasuryBalance: bigint;
	totalEarned: bigint;
}> {
	const treasuryAddress = await getRepoTreasuryAddress(repoId);
	if (!treasuryAddress) {
		return { treasuryBalance: 0n, totalEarned: 0n };
	}

	const client = getPublicClient(getStoredEthRpcUrl());
	const [treasuryBalance, participantCount] = await Promise.all([
		client.readContract({
			address: treasuryAddress,
			abi: aperioTreasuryAbi,
			functionName: "getRepoBalance",
			args: [repoId],
		}) as Promise<bigint>,
		client.readContract({
			address: treasuryAddress,
			abi: aperioTreasuryAbi,
			functionName: "getRepoParticipantCount",
			args: [repoId],
		}) as Promise<bigint>,
	]);

	if (participantCount === 0n) {
		return { treasuryBalance, totalEarned: 0n };
	}

	const participants = await Promise.all(
		Array.from({ length: Number(participantCount) }, (_, index) =>
			client.readContract({
				address: treasuryAddress,
				abi: aperioTreasuryAbi,
				functionName: "getRepoParticipantAt",
				args: [repoId, BigInt(index)],
			}) as Promise<Address>,
		),
	);

	const rewardStatsByParticipant = await Promise.all(
		participants.map((account) =>
			client.readContract({
				address: treasuryAddress,
				abi: aperioTreasuryAbi,
				functionName: "getRepoRewardStats",
				args: [repoId, account],
			}) as Promise<RewardStatsReadResult>,
		),
	);

	const totalEarned = rewardStatsByParticipant.reduce((sum, stats) => sum + stats[0], 0n);
	return { treasuryBalance, totalEarned };
}

function createEmptyLeaderboardEntry(account: Address) {
	return {
		account,
		displayName: account,
		totalEarned: 0n,
		totalClaimed: 0n,
		unclaimed: 0n,
		contributionCount: 0,
		reviewCount: 0,
		repoIds: new Set<string>(),
		lastRewardAt: null as number | null,
		lastClaimAt: null as number | null,
		repos: new Map<string, LeaderboardRepoStats>(),
	};
}

function sortLeaderboard(entries: LeaderboardEntry[]) {
	return entries.sort((left, right) => {
		if (left.totalEarned !== right.totalEarned) {
			return left.totalEarned > right.totalEarned ? -1 : 1;
		}
		if (left.contributionCount !== right.contributionCount) {
			return right.contributionCount - left.contributionCount;
		}
		if (left.totalClaimed !== right.totalClaimed) {
			return left.totalClaimed > right.totalClaimed ? -1 : 1;
		}
		return left.account.localeCompare(right.account);
	});
}

function finalizeLeaderboard(
	internalEntries: Map<string, ReturnType<typeof createEmptyLeaderboardEntry>>,
): LeaderboardEntry[] {
	return sortLeaderboard(
		Array.from(internalEntries.values()).map((entry, index) => ({
			rank: index + 1,
			account: entry.account,
			displayName: entry.displayName,
			totalEarned: entry.totalEarned,
			totalClaimed: entry.totalClaimed,
			unclaimed: entry.totalEarned - entry.totalClaimed,
			contributionCount: entry.contributionCount,
			reviewCount: entry.reviewCount,
			repoCount: entry.repoIds.size,
			lastRewardAt: entry.lastRewardAt,
			lastClaimAt: entry.lastClaimAt,
			lastActivityAt: Math.max(entry.lastRewardAt ?? 0, entry.lastClaimAt ?? 0) || null,
			repos: Array.from(entry.repos.values()).sort((left, right) =>
				left.earned === right.earned ? 0 : left.earned > right.earned ? -1 : 1,
			),
		})),
	).map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function summarizeLeaderboard(entries: LeaderboardEntry[]): LeaderboardSummary {
	return entries.reduce(
		(summary, entry) => ({
			totalEarned: summary.totalEarned + entry.totalEarned,
			totalClaimed: summary.totalClaimed + entry.totalClaimed,
			totalUnclaimed: summary.totalUnclaimed + entry.unclaimed,
			contributorCount: summary.contributorCount + 1,
		}),
		{ totalEarned: 0n, totalClaimed: 0n, totalUnclaimed: 0n, contributorCount: 0 },
	);
}

async function getRepoCatalogItem(
	repoCatalog: Map<string, RepoListItem>,
	repoId: Hex,
): Promise<RepoListItem> {
	const cached = repoCatalog.get(repoId.toLowerCase());
	if (cached) {
		return cached;
	}

	const [repo, metadata, timestamps] = await Promise.all([
		getRepo(repoId),
		getRepoMetadata(repoId),
		getRepoTimestamps(repoId),
	]);
	const item = {
		repoId,
		organization: metadata[0],
		repository: metadata[1],
		maintainer: repo[0],
		headCommit: repo[1],
		headCid: repo[2],
		createdAt: Number(timestamps[0]) || null,
		blockNumber: timestamps[1],
		treasuryBalance: 0n,
		totalEarned: 0n,
	};
	repoCatalog.set(repoId.toLowerCase(), item);
	return item;
}

async function aggregateLeaderboard(
	repoCatalog: Map<string, RepoListItem>,
	treasuryTargets: Array<{ address: Address; repoId: Hex }>,
) {
	const client = getPublicClient(getStoredEthRpcUrl());
	const internalEntries = new Map<string, ReturnType<typeof createEmptyLeaderboardEntry>>();

	for (const target of treasuryTargets) {
		const repoId = target.repoId;
		const [repoMeta, participantCount] = await Promise.all([
			getRepoCatalogItem(repoCatalog, repoId),
			client.readContract({
				address: target.address,
				abi: aperioTreasuryAbi,
				functionName: "getRepoParticipantCount",
				args: [repoId],
			}) as Promise<bigint>,
		]);

		const participants = await Promise.all(
			Array.from({ length: Number(participantCount) }, (_, index) =>
				client.readContract({
					address: target.address,
					abi: aperioTreasuryAbi,
					functionName: "getRepoParticipantAt",
					args: [repoId, BigInt(index)],
				}) as Promise<Address>,
			),
		);

		const rewardStatsByParticipant = await Promise.all(
			participants.map((account) =>
				client.readContract({
					address: target.address,
					abi: aperioTreasuryAbi,
					functionName: "getRepoRewardStats",
					args: [repoId, account],
				}) as Promise<RewardStatsReadResult>,
			),
		);

		for (let index = 0; index < participants.length; index += 1) {
			const account = participants[index];
			const stats = rewardStatsByParticipant[index];
			const cacheKey = account.toLowerCase();
			const entry = internalEntries.get(cacheKey) ?? createEmptyLeaderboardEntry(account);
			const earned = stats[0];
			const claimed = stats[1];
			const contributionCount = Number(stats[2]);
			const reviewCount = Number(stats[3]);
			const lastRewardAt = Number(stats[4]) || null;
			const lastClaimAt = Number(stats[6]) || null;

			if (earned === 0n && claimed === 0n && contributionCount === 0 && reviewCount === 0) {
				continue;
			}

			entry.totalEarned += earned;
			entry.totalClaimed += claimed;
			entry.contributionCount += contributionCount;
			entry.reviewCount += reviewCount;
			entry.repoIds.add(repoId.toLowerCase());
			entry.lastRewardAt = Math.max(entry.lastRewardAt ?? 0, lastRewardAt ?? 0) || null;
			entry.lastClaimAt = Math.max(entry.lastClaimAt ?? 0, lastClaimAt ?? 0) || null;

			const repoStats =
				entry.repos.get(repoId.toLowerCase()) ??
				{
					repoId,
					organization: repoMeta.organization,
					repository: repoMeta.repository,
					earned: 0n,
					claimed: 0n,
					contributionCount: 0,
					reviewCount: 0,
				};
			repoStats.earned += earned;
			repoStats.claimed += claimed;
			repoStats.contributionCount += contributionCount;
			repoStats.reviewCount += reviewCount;

			entry.repos.set(repoId.toLowerCase(), repoStats);
			internalEntries.set(cacheKey, entry);
		}
	}

	const entries = finalizeLeaderboard(internalEntries);
	return { entries, summary: summarizeLeaderboard(entries) };
}

async function readRepoRoles(repoId: Hex, account?: Address): Promise<RepoRoleSet> {
	if (!account) {
		return { isMaintainer: false, isContributor: false, isReviewer: false };
	}

	const client = getPublicClient(getStoredEthRpcUrl());
	const [repo, isContributor, isReviewer] = await Promise.all([
		getRepo(repoId),
		client.readContract({
			address: getRegistryAddress(),
			abi: aperioRegistryAbi,
			functionName: "hasContributorRole",
			args: [repoId, account],
		}) as Promise<boolean>,
		client.readContract({
			address: getRegistryAddress(),
			abi: aperioRegistryAbi,
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

export async function listRepos(): Promise<RepoListItem[]> {
	const client = getPublicClient(getStoredEthRpcUrl());
	const repoCount = (await client.readContract({
		address: getRegistryAddress(),
		abi: aperioRegistryAbi,
		functionName: "getRepoCount",
	})) as bigint;

	const repoIds = await Promise.all(
		Array.from({ length: Number(repoCount) }, (_, index) =>
			client.readContract({
				address: getRegistryAddress(),
				abi: aperioRegistryAbi,
				functionName: "getRepoIdAt",
				args: [BigInt(index)],
			}) as Promise<Hex>,
		),
	);

	const items = await Promise.all(
		repoIds.map(async (repoId) => {
			const [repo, metadata, timestamps, treasurySnapshot] = await Promise.all([
				getRepo(repoId),
				getRepoMetadata(repoId),
				getRepoTimestamps(repoId),
				getRepoTreasurySnapshot(repoId),
			]);
			return {
				repoId,
				organization: metadata[0],
				repository: metadata[1],
				maintainer: repo[0],
				headCommit: repo[1],
				headCid: repo[2],
				createdAt: Number(timestamps[0]) || null,
				blockNumber: timestamps[1],
				treasuryBalance: treasurySnapshot.treasuryBalance,
				totalEarned: treasurySnapshot.totalEarned,
			};
		}),
	);

	return items.sort((left, right) => Number((right.blockNumber ?? 0n) - (left.blockNumber ?? 0n)));
}

export async function readRepoProposals(repoId: Hex): Promise<RepoProposal[]> {
	const client = getPublicClient(getStoredEthRpcUrl());
	const repo = await getRepo(repoId);
	const proposalCount = Number(repo[3]);

	const proposals = await Promise.all(
		Array.from({ length: proposalCount }, async (_, index) => {
			const proposalId = BigInt(index);
			const [proposal, timestamps] = await Promise.all([
				client.readContract({
					address: getRegistryAddress(),
					abi: aperioRegistryAbi,
					functionName: "getProposal",
					args: [repoId, proposalId],
				}) as Promise<ProposalReadResult>,
				client.readContract({
					address: getRegistryAddress(),
					abi: aperioRegistryAbi,
					functionName: "getProposalTimestamps",
					args: [repoId, proposalId],
				}) as Promise<ProposalTimestampsReadResult>,
			]);
			return { proposalId, proposal, timestamps };
		}),
	);

	return proposals
		.map(({ proposalId, proposal, timestamps }) => ({
			id: proposalId,
			contributor: proposal[0],
			proposedCommit: proposal[1],
			proposedCid: proposal[2],
			approvals: proposal[3],
			rejections: proposal[4],
			status: proposal[5],
			mergedCommit: proposal[6],
			mergedCid: proposal[7],
			submittedAt: Number(timestamps[0]) || null,
			submittedBlockNumber: timestamps[1],
			lastReviewedAt: Number(timestamps[2]) || null,
			lastReviewedBlockNumber: timestamps[3],
			mergedAt: Number(timestamps[4]) || null,
			mergedBlockNumber: timestamps[5],
		}))
		.sort((left, right) => Number((right.id ?? 0n) - (left.id ?? 0n)));
}

export async function readRepoHistory(repoId: Hex): Promise<RepoHistoryEntry[]> {
	const [repo, timestamps, proposals] = await Promise.all([
		getRepo(repoId),
		getRepoTimestamps(repoId),
		readRepoProposals(repoId),
	]);

	const initialEntries: RepoHistoryEntry[] = [
		{
			type: "initial",
			commitHash: repo[1],
			cid: repo[2],
			actor: repo[0],
			timestamp: Number(timestamps[0]) || null,
			blockNumber: timestamps[1],
			proposalId: null,
		},
	];

	const mergeEntries = proposals
		.filter((proposal) => proposal.status === 3 && proposal.mergedBlockNumber !== null)
		.map((proposal) => ({
			type: "merge" as const,
			commitHash: proposal.mergedCommit,
			cid: proposal.mergedCid,
			actor: proposal.contributor,
			timestamp: proposal.mergedAt,
			blockNumber: proposal.mergedBlockNumber,
			proposalId: proposal.id,
		}));

	return [...initialEntries, ...mergeEntries].sort(
		(left, right) => Number((right.blockNumber ?? 0n) - (left.blockNumber ?? 0n)),
	);
}

export async function readRepoReleases(repoId: Hex): Promise<RepoRelease[]> {
	const client = getPublicClient(getStoredEthRpcUrl());
	const repo = await getRepo(repoId);
	const releaseCount = Number(repo[4]);

	const releases = await Promise.all(
		Array.from({ length: releaseCount }, (_, index) =>
			client.readContract({
				address: getRegistryAddress(),
				abi: aperioRegistryAbi,
				functionName: "getReleaseAt",
				args: [repoId, BigInt(index)],
			}) as Promise<ReleaseRecordReadResult>,
		),
	);

	return releases
		.map((release) => ({
			version: release[0],
			commitHash: release[1],
			cid: release[2],
			timestamp: Number(release[3]) || null,
			blockNumber: release[4],
		}))
		.sort((left, right) => Number((right.blockNumber ?? 0n) - (left.blockNumber ?? 0n)));
}

export async function readRepoOverview(
	organization: string,
	repository: string,
	account?: Address,
): Promise<RepoOverview> {
	const repoId = deriveRepoId(organization, repository);
	const client = getPublicClient(getStoredEthRpcUrl());
	const registryAddress = getRegistryAddress();
	const [repo, metadata, history, releases, roles, permissionlessContributions] = await Promise.all([
		getRepo(repoId),
		getRepoMetadata(repoId),
		readRepoHistory(repoId),
		readRepoReleases(repoId),
		readRepoRoles(repoId, account),
		client.readContract({
			address: registryAddress,
			abi: aperioRegistryAbi,
			functionName: "isPermissionlessContributions",
			args: [repoId],
		}) as Promise<boolean>,
	]);

	const treasuryAddressRaw = await getRepoTreasuryAddress(repoId);
	const treasuryAddress =
		treasuryAddressRaw && treasuryAddressRaw !== ZERO_ADDRESS ? treasuryAddressRaw : null;

	const treasuryData = treasuryAddress
		? await Promise.all([
				client.readContract({
					address: treasuryAddress,
					abi: aperioTreasuryAbi,
					functionName: "getRepoBalance",
					args: [repoId],
				}) as Promise<bigint>,
				client.readContract({
					address: treasuryAddress,
					abi: aperioTreasuryAbi,
					functionName: "getPayoutConfig",
					args: [repoId],
				}) as Promise<readonly [bigint, bigint]>,
				client.readContract({
					address: treasuryAddress,
					abi: aperioTreasuryAbi,
					functionName: "getRepoTotalClaimable",
					args: [repoId],
				}) as Promise<bigint>,
				client.readContract({
					address: treasuryAddress,
					abi: aperioTreasuryAbi,
					functionName: "getRepoUnfundedClaimable",
					args: [repoId],
				}) as Promise<bigint>,
				account
					? (client.readContract({
							address: treasuryAddress,
							abi: aperioTreasuryAbi,
							functionName: "getClaimable",
							args: [repoId, account],
						}) as Promise<bigint>)
					: Promise.resolve(0n),
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
		permissionlessContributions,
		treasuryBalance: treasuryData?.[0] ?? 0n,
		contributionReward: treasuryData?.[1]?.[0] ?? 0n,
		reviewReward: treasuryData?.[1]?.[1] ?? 0n,
		totalClaimable: treasuryData?.[2] ?? 0n,
		unfundedClaimable: treasuryData?.[3] ?? 0n,
		userClaimable: treasuryData?.[4] ?? 0n,
		commitList: history,
		releases,
		cloneUrl: buildBundleUrl(repo[2]),
	};
}

export async function readRepoLeaderboard(
	repoId: Hex,
	organization: string,
	repository: string,
	treasuryAddress: Address | null,
) {
	if (!treasuryAddress) {
		return {
			entries: [] as LeaderboardEntry[],
			summary: { totalEarned: 0n, totalClaimed: 0n, totalUnclaimed: 0n, contributorCount: 0 },
		};
	}

	const repoCatalog = new Map<string, RepoListItem>();
	repoCatalog.set(repoId.toLowerCase(), {
		repoId,
		organization,
		repository,
		maintainer: ZERO_ADDRESS as Address,
		headCommit: "0x" as Hex,
		headCid: "",
		createdAt: null,
		blockNumber: null,
		treasuryBalance: 0n,
		totalEarned: 0n,
	});

	return aggregateLeaderboard(repoCatalog, [{ address: treasuryAddress, repoId }]);
}

export async function readGlobalLeaderboard() {
	const repos = await listRepos();
	const repoCatalog = new Map(repos.map((repo) => [repo.repoId.toLowerCase(), repo]));
	const treasuryTargets = (
		await Promise.all(
			repos.map(async (repo) => ({
				repoId: repo.repoId,
				address: await getRepoTreasuryAddress(repo.repoId),
			})),
		)
	).filter((target): target is { repoId: Hex; address: Address } => Boolean(target.address));

	return aggregateLeaderboard(repoCatalog, treasuryTargets);
}
