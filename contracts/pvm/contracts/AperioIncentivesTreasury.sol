// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IAperioRepositoryRegistry {
	function getRepo(
		bytes32 repoId
	)
		external
		view
		returns (
			address maintainer,
			bytes32 headCommit,
			string memory headCid,
			uint256 proposalCount,
			uint256 releaseCount
		);
}

/// @title AperioIncentivesTreasury
/// @notice Pull-based incentive accounting for accepted proposals.
///         Rewards are fixed per accepted merge, independent of current pool balance.
contract AperioIncentivesTreasury {
	struct PayoutConfig {
		uint256 contributionReward;
		uint256 reviewReward;
	}

	struct RewardStats {
		uint256 earned;
		uint256 claimed;
		uint256 contributionCount;
		uint256 reviewCount;
		uint64 lastRewardAt;
		uint64 lastRewardBlock;
		uint64 lastClaimAt;
		uint64 lastClaimBlock;
	}

	IAperioRepositoryRegistry public immutable registry;

	// Donations earmarked for each repo.
	mapping(bytes32 => uint256) private repoBalances;
	mapping(bytes32 => PayoutConfig) private payoutConfigs;
	// Claims tracked per repo and account (pull model).
	mapping(bytes32 => mapping(address => uint256)) private claimableByRepo;
	mapping(address => uint256) private totalClaimable;
	mapping(bytes32 => uint256) private repoTotalClaimable;
	mapping(bytes32 => mapping(uint256 => bool)) private rewardedProposals;
	mapping(bytes32 => mapping(address => RewardStats)) private rewardStatsByRepo;
	mapping(address => RewardStats) private globalRewardStats;
	mapping(bytes32 => address[]) private repoParticipants;
	mapping(bytes32 => mapping(address => bool)) private repoParticipantExists;
	address[] private globalParticipants;
	mapping(address => bool) private globalParticipantExists;

	event Donated(
		bytes32 indexed repoId,
		address indexed donor,
		uint256 amount,
		uint256 newRepoBalance
	);
	event PayoutConfigUpdated(
		bytes32 indexed repoId,
		uint256 contributionReward,
		uint256 reviewReward
	);
	event ClaimAccrued(
		bytes32 indexed repoId,
		uint256 indexed proposalId,
		address indexed who,
		uint256 amount
	);
	event ProposalRewardsAccrued(
		bytes32 indexed repoId,
		uint256 indexed proposalId,
		uint256 contributorAmount,
		uint256 reviewerTotalAmount
	);
	event Claimed(bytes32 indexed repoId, address indexed who, uint256 amount);

	constructor(address registryAddress) {
		require(registryAddress != address(0), "Registry required");
		registry = IAperioRepositoryRegistry(registryAddress);
	}

	modifier onlyRegistry() {
		require(msg.sender == address(registry), "Only registry");
		_;
	}

	modifier onlyRepoMaintainer(bytes32 repoId) {
		(address maintainer, , , , ) = registry.getRepo(repoId);
		require(msg.sender == maintainer, "Only maintainer");
		_;
	}

	function donate(bytes32 repoId) external payable {
		require(msg.value > 0, "Donation required");
		// Reverts if repo does not exist.
		registry.getRepo(repoId);

		repoBalances[repoId] += msg.value;
		emit Donated(repoId, msg.sender, msg.value, repoBalances[repoId]);
	}

	function setPayoutConfig(
		bytes32 repoId,
		uint256 contributionReward,
		uint256 reviewReward
	) external onlyRepoMaintainer(repoId) {
		payoutConfigs[repoId] = PayoutConfig({
			contributionReward: contributionReward,
			reviewReward: reviewReward
		});

		emit PayoutConfigUpdated(repoId, contributionReward, reviewReward);
	}

	function onProposalMerged(
		bytes32 repoId,
		uint256 proposalId,
		address contributor,
		address[] calldata reviewers
	) external onlyRegistry {
		require(!rewardedProposals[repoId][proposalId], "Proposal already rewarded");
		rewardedProposals[repoId][proposalId] = true;

		PayoutConfig storage cfg = payoutConfigs[repoId];

		uint256 contributorAmount = 0;
		if (contributor != address(0) && cfg.contributionReward > 0) {
			contributorAmount = cfg.contributionReward;
			_accrueClaim(repoId, proposalId, contributor, contributorAmount);
			_recordReward(repoId, contributor, contributorAmount, true);
		}

		uint256 reviewerTotalAmount = 0;
		if (cfg.reviewReward > 0) {
			for (uint256 i = 0; i < reviewers.length; i++) {
				address reviewer = reviewers[i];
				if (reviewer == address(0)) {
					continue;
				}
				_accrueClaim(repoId, proposalId, reviewer, cfg.reviewReward);
				_recordReward(repoId, reviewer, cfg.reviewReward, false);
				reviewerTotalAmount += cfg.reviewReward;
			}
		}

		emit ProposalRewardsAccrued(repoId, proposalId, contributorAmount, reviewerTotalAmount);
	}

	function claim(bytes32 repoId) external {
		uint256 amount = claimableByRepo[repoId][msg.sender];
		require(amount > 0, "Nothing to claim");
		require(repoBalances[repoId] >= amount, "Insufficient funded balance");

		claimableByRepo[repoId][msg.sender] = 0;
		totalClaimable[msg.sender] -= amount;
		repoTotalClaimable[repoId] -= amount;
		repoBalances[repoId] -= amount;
		_recordClaim(repoId, msg.sender, amount);

		(bool sent, ) = payable(msg.sender).call{value: amount}("");
		require(sent, "Claim transfer failed");

		emit Claimed(repoId, msg.sender, amount);
	}

	function getRepoBalance(bytes32 repoId) external view returns (uint256) {
		return repoBalances[repoId];
	}

	function getPayoutConfig(
		bytes32 repoId
	) external view returns (uint256 contributionReward, uint256 reviewReward) {
		PayoutConfig storage cfg = payoutConfigs[repoId];
		return (cfg.contributionReward, cfg.reviewReward);
	}

	function getClaimable(bytes32 repoId, address who) external view returns (uint256) {
		return claimableByRepo[repoId][who];
	}

	function getTotalClaimable(address who) external view returns (uint256) {
		return totalClaimable[who];
	}

	function getRepoTotalClaimable(bytes32 repoId) external view returns (uint256) {
		return repoTotalClaimable[repoId];
	}

	function getRepoUnfundedClaimable(bytes32 repoId) external view returns (uint256) {
		uint256 totalForRepo = repoTotalClaimable[repoId];
		uint256 funded = repoBalances[repoId];
		if (totalForRepo <= funded) {
			return 0;
		}
		return totalForRepo - funded;
	}

	function hasProposalBeenRewarded(
		bytes32 repoId,
		uint256 proposalId
	) external view returns (bool) {
		return rewardedProposals[repoId][proposalId];
	}

	function getRepoParticipantCount(bytes32 repoId) external view returns (uint256) {
		return repoParticipants[repoId].length;
	}

	function getRepoParticipantAt(bytes32 repoId, uint256 index) external view returns (address) {
		require(index < repoParticipants[repoId].length, "Participant not found");
		return repoParticipants[repoId][index];
	}

	function getRepoRewardStats(bytes32 repoId, address account)
		external
		view
		returns (
			uint256 earned,
			uint256 claimed,
			uint256 contributionCount,
			uint256 reviewCount,
			uint64 lastRewardAt,
			uint64 lastRewardBlock,
			uint64 lastClaimAt,
			uint64 lastClaimBlock
		)
	{
		RewardStats storage stats = rewardStatsByRepo[repoId][account];
		return (
			stats.earned,
			stats.claimed,
			stats.contributionCount,
			stats.reviewCount,
			stats.lastRewardAt,
			stats.lastRewardBlock,
			stats.lastClaimAt,
			stats.lastClaimBlock
		);
	}

	function getGlobalParticipantCount() external view returns (uint256) {
		return globalParticipants.length;
	}

	function getGlobalParticipantAt(uint256 index) external view returns (address) {
		require(index < globalParticipants.length, "Participant not found");
		return globalParticipants[index];
	}

	function getGlobalRewardStats(address account)
		external
		view
		returns (
			uint256 earned,
			uint256 claimed,
			uint256 contributionCount,
			uint256 reviewCount,
			uint64 lastRewardAt,
			uint64 lastRewardBlock,
			uint64 lastClaimAt,
			uint64 lastClaimBlock
		)
	{
		RewardStats storage stats = globalRewardStats[account];
		return (
			stats.earned,
			stats.claimed,
			stats.contributionCount,
			stats.reviewCount,
			stats.lastRewardAt,
			stats.lastRewardBlock,
			stats.lastClaimAt,
			stats.lastClaimBlock
		);
	}

	function _accrueClaim(bytes32 repoId, uint256 proposalId, address who, uint256 amount) private {
		_registerParticipant(repoId, who);
		claimableByRepo[repoId][who] += amount;
		totalClaimable[who] += amount;
		repoTotalClaimable[repoId] += amount;
		emit ClaimAccrued(repoId, proposalId, who, amount);
	}

	function _recordReward(bytes32 repoId, address who, uint256 amount, bool isContribution) private {
		RewardStats storage repoStats = rewardStatsByRepo[repoId][who];
		RewardStats storage globalStats = globalRewardStats[who];
		uint64 rewardedAt = uint64(block.timestamp);
		uint64 rewardedInBlock = uint64(block.number);

		repoStats.earned += amount;
		globalStats.earned += amount;

		if (isContribution) {
			repoStats.contributionCount += 1;
			globalStats.contributionCount += 1;
		} else {
			repoStats.reviewCount += 1;
			globalStats.reviewCount += 1;
		}

		repoStats.lastRewardAt = rewardedAt;
		repoStats.lastRewardBlock = rewardedInBlock;
		globalStats.lastRewardAt = rewardedAt;
		globalStats.lastRewardBlock = rewardedInBlock;
	}

	function _recordClaim(bytes32 repoId, address who, uint256 amount) private {
		RewardStats storage repoStats = rewardStatsByRepo[repoId][who];
		RewardStats storage globalStats = globalRewardStats[who];
		uint64 claimedAt = uint64(block.timestamp);
		uint64 claimedInBlock = uint64(block.number);

		repoStats.claimed += amount;
		globalStats.claimed += amount;
		repoStats.lastClaimAt = claimedAt;
		repoStats.lastClaimBlock = claimedInBlock;
		globalStats.lastClaimAt = claimedAt;
		globalStats.lastClaimBlock = claimedInBlock;
	}

	function _registerParticipant(bytes32 repoId, address who) private {
		if (!repoParticipantExists[repoId][who]) {
			repoParticipantExists[repoId][who] = true;
			repoParticipants[repoId].push(who);
		}
		if (!globalParticipantExists[who]) {
			globalParticipantExists[who] = true;
			globalParticipants.push(who);
		}
	}
}
