import type { Address, Hex } from "viem";

export type RepoReadResult = readonly [Address, Hex, string, bigint, bigint];
export type RepoMetadataReadResult = readonly [string, string];
export type ProposalReadResult = readonly [Address, Hex, string, bigint, bigint, number, Hex, string];
export type RepoTimestampsReadResult = readonly [bigint, bigint, bigint, bigint];
export type ProposalTimestampsReadResult = readonly [bigint, bigint, bigint, bigint, bigint, bigint];
export type ReleaseRecordReadResult = readonly [string, Hex, string, bigint, bigint];
export type RewardStatsReadResult = readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];

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

export type RepoProposal = {
	id: bigint;
	contributor: Address;
	proposedCommit: Hex;
	proposedCid: string;
	approvals: bigint;
	rejections: bigint;
	status: number;
	mergedCommit: Hex;
	mergedCid: string;
	submittedAt: number | null;
	submittedBlockNumber: bigint | null;
	lastReviewedAt: number | null;
	lastReviewedBlockNumber: bigint | null;
	mergedAt: number | null;
	mergedBlockNumber: bigint | null;
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
	permissionlessContributions: boolean;
	treasuryBalance: bigint | null;
	contributionReward: bigint | null;
	reviewReward: bigint | null;
	totalClaimable: bigint | null;
	unfundedClaimable: bigint | null;
	commitList: RepoHistoryEntry[];
	releases: RepoRelease[];
	cloneUrl: string | null;
};

export type LeaderboardRepoStats = {
	repoId: Hex;
	organization: string;
	repository: string;
	earned: bigint;
	claimed: bigint;
	contributionCount: number;
	reviewCount: number;
};

export type LeaderboardEntry = {
	rank: number;
	account: Address;
	displayName: string;
	totalEarned: bigint;
	totalClaimed: bigint;
	unclaimed: bigint;
	contributionCount: number;
	reviewCount: number;
	repoCount: number;
	lastRewardAt: number | null;
	lastClaimAt: number | null;
	lastActivityAt: number | null;
	repos: LeaderboardRepoStats[];
};

export type LeaderboardSummary = {
	totalEarned: bigint;
	totalClaimed: bigint;
	totalUnclaimed: bigint;
	contributorCount: number;
};
