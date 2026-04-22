// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title AperioRepositoryRegistry
/// @notice Minimal censorship-resistant repository registry:
///         repo -> proposals -> reviews -> merge (HEAD) -> releases.
interface IAperioIncentivesTreasury {
    function onProposalMerged(bytes32 repoId, uint256 proposalId, address contributor, address[] calldata reviewers)
        external;
}

import "./AperioIncentivesTreasury.sol";

contract AperioRepositoryRegistry {
    /// @dev Proposal IDs are scoped per-repo and allocated from `Repo.proposalCount`.
    ///      The first proposal for a repo is ID 0, then 1, 2, ...
    enum ProposalStatus {
        None,
        Open,
        Rejected,
        Merged
    }

    struct Repo {
        string organization;
        string name;
        address maintainer;
        /// @dev Canonical HEAD commit identifier recorded on-chain.
        bytes32 headCommit;
        string headCid;
        /// @dev Next proposal ID to assign for this repo (also total proposals created).
        uint256 proposalCount;
        uint256 releaseCount;
        address incentiveTreasury;
        bool exists;
        /// @dev When true, any address may submit proposals without a contributor role.
        bool permissionlessContributions;
    }

    struct Proposal {
        address contributor;
        /// @dev Proposed commit identifier (32-byte canonicalized value chosen off-chain).
        bytes32 proposedCommit;
        string proposedCid;
        uint256 approvals;
        uint256 rejections;
        ProposalStatus status;
        /// @dev Final accepted commit identifier written at merge time.
        bytes32 mergedCommit;
        string mergedCid;
    }

    struct Review {
        bool exists;
        bool approved;
    }

    struct Release {
        string version;
        /// @dev Canonical commit identifier associated with this release tag.
        bytes32 commitHash;
        string cid;
        bool exists;
    }

    mapping(bytes32 => Repo) private repos;
    /// @dev proposals[repoId][proposalId]
    mapping(bytes32 => mapping(uint256 => Proposal)) private proposals;
    /// @dev reviews[repoId][proposalId][reviewer]
    mapping(bytes32 => mapping(uint256 => mapping(address => Review))) private reviews;
    /// @dev Approved reviewers to reward when the proposal is merged.
    mapping(bytes32 => mapping(uint256 => address[])) private approvedReviewers;
    mapping(bytes32 => mapping(bytes32 => Release)) private releases;
    /// @dev canonicalCommits[repoId][commitHash] == true once accepted as canonical.
    mapping(bytes32 => mapping(bytes32 => bool)) private canonicalCommits;
    mapping(bytes32 => mapping(address => bool)) private contributorRoles;
    mapping(bytes32 => mapping(address => bool)) private reviewerRoles;

    IAperioIncentivesTreasury public immutable treasury;

    event RepoCreated(
        bytes32 indexed repoId,
        address indexed maintainer,
        bytes32 indexed headCommit,
        string organization,
        string name,
        string headCid
    );
    event ProposalSubmitted(
        bytes32 indexed repoId, uint256 indexed proposalId, address indexed contributor, bytes32 commitHash, string cid
    );
    event ProposalReviewed(bytes32 indexed repoId, uint256 indexed proposalId, address indexed reviewer, bool approved);
    event ProposalMerged(
        bytes32 indexed repoId, uint256 indexed proposalId, bytes32 indexed finalCommitHash, string finalCid
    );
    event ReleaseCreated(bytes32 indexed repoId, bytes32 indexed commitHash, string version, string cid);
    event MaintainerTransferred(
        bytes32 indexed repoId, address indexed previousMaintainer, address indexed newMaintainer
    );
    event ContributorRoleUpdated(bytes32 indexed repoId, address indexed account, bool enabled);
    event ReviewerRoleUpdated(bytes32 indexed repoId, address indexed account, bool enabled);
    event IncentiveTreasuryUpdated(bytes32 indexed repoId, address indexed treasury);

    constructor() {
        treasury = IAperioIncentivesTreasury(address(new AperioIncentivesTreasury(address(this))));
    }

    function createRepo(
        string calldata organization,
        string calldata name,
        bytes32 initialHeadCommit,
        string calldata initialHeadCid,
        bool permissionlessContributions
    ) external returns (bytes32 repoId) {
        require(bytes(organization).length != 0, "Organization required");
        require(bytes(name).length != 0, "Repository name required");
        require(initialHeadCommit != bytes32(0), "Head commit required");
        require(bytes(initialHeadCid).length != 0, "Head CID required");

        repoId = deriveRepoId(organization, name);
        require(repoId != bytes32(0), "Repo id required");
        require(!repos[repoId].exists, "Repo already exists");

        Repo storage repo = repos[repoId];
        repo.organization = organization;
        repo.name = name;
        repo.maintainer = msg.sender;
        repo.headCommit = initialHeadCommit;
        repo.headCid = initialHeadCid;
        repo.exists = true;
        repo.permissionlessContributions = permissionlessContributions;

        canonicalCommits[repoId][initialHeadCommit] = true;

        setIncentiveTreasury(repoId);

        emit RepoCreated(repoId, msg.sender, initialHeadCommit, organization, name, initialHeadCid);
    }

    function deriveRepoId(string memory organization, string memory name) public pure returns (bytes32) {
        return keccak256(bytes(string.concat(organization, "/", name)));
    }

    function transferMaintainer(bytes32 repoId, address newMaintainer) external {
        Repo storage repo = repos[repoId];
        require(repo.exists, "Repo not found");
        require(msg.sender == repo.maintainer, "Only maintainer");
        require(newMaintainer != address(0), "Maintainer required");

        address previousMaintainer = repo.maintainer;
        repo.maintainer = newMaintainer;

        emit MaintainerTransferred(repoId, previousMaintainer, newMaintainer);
    }

    function setContributorRole(bytes32 repoId, address account, bool enabled) external {
        Repo storage repo = repos[repoId];
        require(repo.exists, "Repo not found");
        require(msg.sender == repo.maintainer, "Only maintainer");
        require(account != address(0), "Account required");

        contributorRoles[repoId][account] = enabled;
        emit ContributorRoleUpdated(repoId, account, enabled);
    }

    function setReviewerRole(bytes32 repoId, address account, bool enabled) external {
        Repo storage repo = repos[repoId];
        require(repo.exists, "Repo not found");
        require(msg.sender == repo.maintainer, "Only maintainer");
        require(account != address(0), "Account required");

        reviewerRoles[repoId][account] = enabled;
        emit ReviewerRoleUpdated(repoId, account, enabled);
    }

    function setIncentiveTreasury(bytes32 repoId) public {
        Repo storage repo = repos[repoId];
        require(repo.exists, "Repo not found");
        require(msg.sender == repo.maintainer, "Only maintainer");

        repo.incentiveTreasury = address(treasury);
        emit IncentiveTreasuryUpdated(repoId, address(treasury));
    }

    function submitProposal(bytes32 repoId, bytes32 proposedCommit, string calldata proposedCid)
        external
        returns (uint256 proposalId)
    {
        Repo storage repo = repos[repoId];
        require(repo.exists, "Repo not found");
        if (!repo.permissionlessContributions) {
            require(contributorRoles[repoId][msg.sender], "Contributor role required");
        }
        require(proposedCommit != bytes32(0), "Commit required");
        require(bytes(proposedCid).length != 0, "CID required");

        // Monotonic per-repo ID allocation (0-based).
        proposalId = repo.proposalCount;
        repo.proposalCount += 1;

        Proposal storage proposal = proposals[repoId][proposalId];
        proposal.contributor = msg.sender;
        proposal.proposedCommit = proposedCommit;
        proposal.proposedCid = proposedCid;
        proposal.status = ProposalStatus.Open;

        emit ProposalSubmitted(repoId, proposalId, msg.sender, proposedCommit, proposedCid);
    }

    function reviewProposal(bytes32 repoId, uint256 proposalId, bool approved) external {
        Repo storage repo = repos[repoId];
        require(repo.exists, "Repo not found");
        require(proposalId < repo.proposalCount, "Proposal not found");

        Proposal storage proposal = proposals[repoId][proposalId];
        require(proposal.status == ProposalStatus.Open, "Proposal not open");
        require(reviewerRoles[repoId][msg.sender], "Reviewer role required");
        // require(msg.sender != repo.maintainer, "Maintainer cannot review");
        // require(msg.sender != proposal.contributor, "Contributor cannot review"); allow this for DEV so I do everything with the same account
        require(!reviews[repoId][proposalId][msg.sender].exists, "Already reviewed");

        reviews[repoId][proposalId][msg.sender] = Review({exists: true, approved: approved});

        if (approved) {
            proposal.approvals += 1;
            approvedReviewers[repoId][proposalId].push(msg.sender);
        } else {
            proposal.rejections += 1;
            proposal.status = ProposalStatus.Rejected;
        }

        emit ProposalReviewed(repoId, proposalId, msg.sender, approved);
    }

    function mergeProposal(bytes32 repoId, uint256 proposalId, bytes32 finalCommitHash, string calldata finalCid)
        external
    {
        Repo storage repo = repos[repoId];
        require(repo.exists, "Repo not found");
        require(msg.sender == repo.maintainer, "Only maintainer");
        require(proposalId < repo.proposalCount, "Proposal not found");
        require(finalCommitHash != bytes32(0), "Commit required");
        require(bytes(finalCid).length != 0, "CID required");

        Proposal storage proposal = proposals[repoId][proposalId];
        require(proposal.status == ProposalStatus.Open, "Proposal not open");
        require(proposal.approvals > 0, "Approval required");
        require(proposal.rejections == 0, "Proposal rejected");

        proposal.status = ProposalStatus.Merged;
        proposal.mergedCommit = finalCommitHash;
        proposal.mergedCid = finalCid;

        repo.headCommit = finalCommitHash;
        repo.headCid = finalCid;

        canonicalCommits[repoId][finalCommitHash] = true;

        emit ProposalMerged(repoId, proposalId, finalCommitHash, finalCid);

        if (repo.incentiveTreasury != address(0)) {
            address[] memory reviewers = approvedReviewers[repoId][proposalId];
            try IAperioIncentivesTreasury(repo.incentiveTreasury)
                .onProposalMerged(repoId, proposalId, proposal.contributor, reviewers) {}
                catch {}
        }
    }

    function createRelease(bytes32 repoId, string calldata version, bytes32 commitHash, string calldata cid) external {
        Repo storage repo = repos[repoId];
        require(repo.exists, "Repo not found");
        require(msg.sender == repo.maintainer, "Only maintainer");
        require(bytes(version).length != 0, "Version required");
        require(commitHash != bytes32(0), "Commit required");
        require(bytes(cid).length != 0, "CID required");
        require(canonicalCommits[repoId][commitHash], "Commit not canonical");

        bytes32 versionKey = keccak256(bytes(version));
        require(!releases[repoId][versionKey].exists, "Release already exists");

        releases[repoId][versionKey] = Release({version: version, commitHash: commitHash, cid: cid, exists: true});
        repo.releaseCount += 1;

        emit ReleaseCreated(repoId, commitHash, version, cid);
    }

    function getRepo(bytes32 repoId)
        external
        view
        returns (
            address maintainer,
            bytes32 headCommit,
            string memory headCid,
            uint256 proposalCount,
            uint256 releaseCount
        )
    {
        Repo storage repo = repos[repoId];
        require(repo.exists, "Repo not found");
        return (repo.maintainer, repo.headCommit, repo.headCid, repo.proposalCount, repo.releaseCount);
    }

    function getRepoMetadata(bytes32 repoId) external view returns (string memory organization, string memory name) {
        Repo storage repo = repos[repoId];
        require(repo.exists, "Repo not found");
        return (repo.organization, repo.name);
    }

    function getProposal(bytes32 repoId, uint256 proposalId)
        external
        view
        returns (
            address contributor,
            bytes32 proposedCommit,
            string memory proposedCid,
            uint256 approvals,
            uint256 rejections,
            ProposalStatus status,
            bytes32 mergedCommit,
            string memory mergedCid
        )
    {
        Repo storage repo = repos[repoId];
        require(repo.exists, "Repo not found");
        require(proposalId < repo.proposalCount, "Proposal not found");

        Proposal storage proposal = proposals[repoId][proposalId];
        return (
            proposal.contributor,
            proposal.proposedCommit,
            proposal.proposedCid,
            proposal.approvals,
            proposal.rejections,
            proposal.status,
            proposal.mergedCommit,
            proposal.mergedCid
        );
    }

    function getReview(bytes32 repoId, uint256 proposalId, address reviewer)
        external
        view
        returns (bool exists, bool approved)
    {
        Repo storage repo = repos[repoId];
        require(repo.exists, "Repo not found");
        require(proposalId < repo.proposalCount, "Proposal not found");

        Review storage review = reviews[repoId][proposalId][reviewer];
        return (review.exists, review.approved);
    }

    function getRelease(bytes32 repoId, string calldata version)
        external
        view
        returns (bytes32 commitHash, string memory cid)
    {
        Repo storage repo = repos[repoId];
        require(repo.exists, "Repo not found");
        bytes32 versionKey = keccak256(bytes(version));
        Release storage release_ = releases[repoId][versionKey];
        require(release_.exists, "Release not found");
        return (release_.commitHash, release_.cid);
    }

    function getRepoIncentiveTreasury(bytes32 repoId) external view returns (address treasury) {
        Repo storage repo = repos[repoId];
        require(repo.exists, "Repo not found");
        return repo.incentiveTreasury;
    }

    function hasContributorRole(bytes32 repoId, address account) external view returns (bool) {
        return contributorRoles[repoId][account];
    }

    function hasReviewerRole(bytes32 repoId, address account) external view returns (bool) {
        return reviewerRoles[repoId][account];
    }

    function isCanonicalCommit(bytes32 repoId, bytes32 commitHash) external view returns (bool) {
        return canonicalCommits[repoId][commitHash];
    }

    function isPermissionlessContributions(bytes32 repoId) external view returns (bool) {
        return repos[repoId].permissionlessContributions;
    }
}
