import { parseAbiItem } from "viem";

export const aperioRegistryAbi = [
	{
		type: "function",
		name: "createRepo",
		inputs: [
			{ name: "organization", type: "string" },
			{ name: "name", type: "string" },
			{ name: "initialHeadCommit", type: "bytes32" },
			{ name: "initialHeadCid", type: "string" },
			{ name: "permissionlessContributions", type: "bool" },
		],
		outputs: [{ name: "repoId", type: "bytes32" }],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "isPermissionlessContributions",
		inputs: [{ name: "repoId", type: "bytes32" }],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
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
		name: "getRepoTimestamps",
		inputs: [{ name: "repoId", type: "bytes32" }],
		outputs: [
			{ name: "createdAt", type: "uint64" },
			{ name: "createdInBlock", type: "uint64" },
			{ name: "updatedAt", type: "uint64" },
			{ name: "updatedInBlock", type: "uint64" },
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
		name: "getProposalTimestamps",
		inputs: [
			{ name: "repoId", type: "bytes32" },
			{ name: "proposalId", type: "uint256" },
		],
		outputs: [
			{ name: "submittedAt", type: "uint64" },
			{ name: "submittedInBlock", type: "uint64" },
			{ name: "lastReviewedAt", type: "uint64" },
			{ name: "lastReviewedInBlock", type: "uint64" },
			{ name: "mergedAt", type: "uint64" },
			{ name: "mergedInBlock", type: "uint64" },
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
	{
		type: "function",
		name: "submitProposal",
		inputs: [
			{ name: "repoId", type: "bytes32" },
			{ name: "proposedCommit", type: "bytes32" },
			{ name: "proposedCid", type: "string" },
		],
		outputs: [{ name: "proposalId", type: "uint256" }],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "reviewProposal",
		inputs: [
			{ name: "repoId", type: "bytes32" },
			{ name: "proposalId", type: "uint256" },
			{ name: "approved", type: "bool" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "mergeProposal",
		inputs: [
			{ name: "repoId", type: "bytes32" },
			{ name: "proposalId", type: "uint256" },
			{ name: "finalCommitHash", type: "bytes32" },
			{ name: "finalCid", type: "string" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "getReview",
		inputs: [
			{ name: "repoId", type: "bytes32" },
			{ name: "proposalId", type: "uint256" },
			{ name: "reviewer", type: "address" },
		],
		outputs: [
			{ name: "exists", type: "bool" },
			{ name: "approved", type: "bool" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getReleaseAt",
		inputs: [
			{ name: "repoId", type: "bytes32" },
			{ name: "releaseIndex", type: "uint256" },
		],
		outputs: [
			{ name: "version", type: "string" },
			{ name: "commitHash", type: "bytes32" },
			{ name: "cid", type: "string" },
			{ name: "createdAt", type: "uint64" },
			{ name: "createdInBlock", type: "uint64" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getRepoCount",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getRepoIdAt",
		inputs: [{ name: "repoIndex", type: "uint256" }],
		outputs: [{ name: "", type: "bytes32" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "setContributorRole",
		inputs: [
			{ name: "repoId", type: "bytes32" },
			{ name: "account", type: "address" },
			{ name: "enabled", type: "bool" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
	{
		type: "function",
		name: "setReviewerRole",
		inputs: [
			{ name: "repoId", type: "bytes32" },
			{ name: "account", type: "address" },
			{ name: "enabled", type: "bool" },
		],
		outputs: [],
		stateMutability: "nonpayable",
	},
] as const;

export const aperioTreasuryAbi = [
	{
		type: "function",
		name: "donate",
		inputs: [{ name: "repoId", type: "bytes32" }],
		outputs: [],
		stateMutability: "payable",
	},
	{
		type: "function",
		name: "claim",
		inputs: [{ name: "repoId", type: "bytes32" }],
		outputs: [],
		stateMutability: "nonpayable",
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
		name: "setPayoutConfig",
		inputs: [
			{ name: "repoId", type: "bytes32" },
			{ name: "contributionReward", type: "uint256" },
			{ name: "reviewReward", type: "uint256" },
		],
		outputs: [],
		stateMutability: "nonpayable",
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
		name: "getClaimable",
		inputs: [
			{ name: "repoId", type: "bytes32" },
			{ name: "who", type: "address" },
		],
		outputs: [{ name: "", type: "uint256" }],
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
	{
		type: "function",
		name: "getRepoParticipantCount",
		inputs: [{ name: "repoId", type: "bytes32" }],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getRepoParticipantAt",
		inputs: [
			{ name: "repoId", type: "bytes32" },
			{ name: "index", type: "uint256" },
		],
		outputs: [{ name: "", type: "address" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getRepoRewardStats",
		inputs: [
			{ name: "repoId", type: "bytes32" },
			{ name: "account", type: "address" },
		],
		outputs: [
			{ name: "earned", type: "uint256" },
			{ name: "claimed", type: "uint256" },
			{ name: "contributionCount", type: "uint256" },
			{ name: "reviewCount", type: "uint256" },
			{ name: "lastRewardAt", type: "uint64" },
			{ name: "lastRewardBlock", type: "uint64" },
			{ name: "lastClaimAt", type: "uint64" },
			{ name: "lastClaimBlock", type: "uint64" },
		],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getGlobalParticipantCount",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getGlobalParticipantAt",
		inputs: [{ name: "index", type: "uint256" }],
		outputs: [{ name: "", type: "address" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "getGlobalRewardStats",
		inputs: [{ name: "account", type: "address" }],
		outputs: [
			{ name: "earned", type: "uint256" },
			{ name: "claimed", type: "uint256" },
			{ name: "contributionCount", type: "uint256" },
			{ name: "reviewCount", type: "uint256" },
			{ name: "lastRewardAt", type: "uint64" },
			{ name: "lastRewardBlock", type: "uint64" },
			{ name: "lastClaimAt", type: "uint64" },
			{ name: "lastClaimBlock", type: "uint64" },
		],
		stateMutability: "view",
	},
] as const;

export const repoCreatedEvent = parseAbiItem(
	"event RepoCreated(bytes32 indexed repoId, address indexed maintainer, bytes32 indexed headCommit, string organization, string name, string headCid)",
);
export const proposalSubmittedEvent = parseAbiItem(
	"event ProposalSubmitted(bytes32 indexed repoId, uint256 indexed proposalId, address indexed contributor, bytes32 commitHash, string cid)",
);
export const proposalReviewedEvent = parseAbiItem(
	"event ProposalReviewed(bytes32 indexed repoId, uint256 indexed proposalId, address indexed reviewer, bool approved)",
);
export const proposalMergedEvent = parseAbiItem(
	"event ProposalMerged(bytes32 indexed repoId, uint256 indexed proposalId, bytes32 indexed finalCommitHash, string finalCid)",
);
export const releaseCreatedEvent = parseAbiItem(
	"event ReleaseCreated(bytes32 indexed repoId, bytes32 indexed commitHash, string version, string cid)",
);
export const claimAccruedEvent = parseAbiItem(
	"event ClaimAccrued(bytes32 indexed repoId, uint256 indexed proposalId, address indexed who, uint256 amount)",
);
export const claimedEvent = parseAbiItem(
	"event Claimed(bytes32 indexed repoId, address indexed who, uint256 amount)",
);
