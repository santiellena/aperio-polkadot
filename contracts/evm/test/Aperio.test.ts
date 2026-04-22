import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { getAddress, keccak256, parseEther, toBytes } from "viem";

const STATUS_OPEN = 1;
const STATUS_REJECTED = 2;
const STATUS_MERGED = 3;

const organization = "acme";
const repository = "aperio";
const repoId = keccak256(toBytes(`${organization}/${repository}`));
const initialHeadCommit = keccak256(toBytes("main:0001"));
const initialHeadCid = "cid:main:0001";
const proposedCommit = keccak256(toBytes("main:0002"));
const proposedCid = "cid:proposal:0002";
const mergedCommit = keccak256(toBytes("main:0003"));
const mergedCid = "cid:merge:0003";
const version = "v1.0.0";
const releaseCid = "cid:release:v1.0.0";

async function expectRevert(txPromise: Promise<unknown>, expectedMessage: string): Promise<void> {
	try {
		await txPromise;
		expect.fail("Expected transaction to revert");
	} catch (error: unknown) {
		expect(String(error)).to.include(expectedMessage);
	}
}

describe("AperioRepositoryRegistry (EVM)", function () {
	async function deployFixture() {
		const [maintainer, contributor, reviewer, otherReviewer, outsider] =
			await hre.viem.getWalletClients();
		const registry = await hre.viem.deployContract("AperioRepositoryRegistry");
		return { registry, maintainer, contributor, reviewer, otherReviewer, outsider };
	}

	async function createRepo(
		registry: Awaited<ReturnType<typeof deployFixture>>["registry"],
		maintainerAddress: `0x${string}`,
	): Promise<void> {
		await registry.write.createRepo(
			[organization, repository, initialHeadCommit, initialHeadCid, false],
			{
			account: maintainerAddress,
			},
		);
	}

	async function grantContributorRole(
		registry: Awaited<ReturnType<typeof deployFixture>>["registry"],
		maintainerAddress: `0x${string}`,
		account: `0x${string}`,
	): Promise<void> {
		await registry.write.setContributorRole([repoId, account, true], {
			account: maintainerAddress,
		});
	}

	async function grantReviewerRole(
		registry: Awaited<ReturnType<typeof deployFixture>>["registry"],
		maintainerAddress: `0x${string}`,
		account: `0x${string}`,
	): Promise<void> {
		await registry.write.setReviewerRole([repoId, account, true], {
			account: maintainerAddress,
		});
	}

	it("creates a repository and sets initial canonical HEAD", async function () {
		const { registry, maintainer } = await loadFixture(deployFixture);
		await createRepo(registry, maintainer.account.address);

		const [storedMaintainer, headCommit, headCid, proposalCount, releaseCount] =
			await registry.read.getRepo([repoId]);
		const [storedOrganization, storedRepository] = await registry.read.getRepoMetadata([repoId]);
		expect(getAddress(storedMaintainer)).to.equal(getAddress(maintainer.account.address));
		expect(storedOrganization).to.equal(organization);
		expect(storedRepository).to.equal(repository);
		expect(headCommit).to.equal(initialHeadCommit);
		expect(headCid).to.equal(initialHeadCid);
		expect(proposalCount).to.equal(0n);
		expect(releaseCount).to.equal(0n);
		expect(await registry.read.isCanonicalCommit([repoId, initialHeadCommit])).to.equal(true);
	});

	it("lets maintainer configure contributor and reviewer roles", async function () {
		const { registry, maintainer, contributor, reviewer } = await loadFixture(deployFixture);
		await createRepo(registry, maintainer.account.address);

		await grantContributorRole(
			registry,
			maintainer.account.address,
			contributor.account.address,
		);
		await grantReviewerRole(registry, maintainer.account.address, reviewer.account.address);

		expect(
			await registry.read.hasContributorRole([repoId, contributor.account.address]),
		).to.equal(true);
		expect(await registry.read.hasReviewerRole([repoId, reviewer.account.address])).to.equal(
			true,
		);
	});

	it("restricts role configuration and maintainer transfer to current maintainer", async function () {
		const { registry, maintainer, contributor, outsider } = await loadFixture(deployFixture);
		await createRepo(registry, maintainer.account.address);

		await expectRevert(
			registry.write.setContributorRole([repoId, contributor.account.address, true], {
				account: outsider.account.address,
			}),
			"Only maintainer",
		);

		await registry.write.transferMaintainer([repoId, outsider.account.address], {
			account: maintainer.account.address,
		});

		const [storedMaintainer] = await registry.read.getRepo([repoId]);
		expect(getAddress(storedMaintainer)).to.equal(getAddress(outsider.account.address));

		await expectRevert(
			registry.write.setReviewerRole([repoId, contributor.account.address, true], {
				account: maintainer.account.address,
			}),
			"Only maintainer",
		);
	});

	it("rejects duplicate repository creation", async function () {
		const { registry, maintainer } = await loadFixture(deployFixture);
		await createRepo(registry, maintainer.account.address);
		await expectRevert(
			registry.write.createRepo([organization, repository, initialHeadCommit, initialHeadCid], {
				account: maintainer.account.address,
			}),
			"Repo already exists",
		);
	});

	it("submits a proposal and stores contributor commit and CID", async function () {
		const { registry, maintainer, contributor } = await loadFixture(deployFixture);
		await createRepo(registry, maintainer.account.address);
		await grantContributorRole(
			registry,
			maintainer.account.address,
			contributor.account.address,
		);

		await registry.write.submitProposal([repoId, proposedCommit, proposedCid], {
			account: contributor.account.address,
		});

		const [
			storedContributor,
			storedProposedCommit,
			storedProposedCid,
			approvals,
			rejections,
			status,
			storedMergedCommit,
			storedMergedCid,
		] = await registry.read.getProposal([repoId, 0n]);

		expect(getAddress(storedContributor)).to.equal(getAddress(contributor.account.address));
		expect(storedProposedCommit).to.equal(proposedCommit);
		expect(storedProposedCid).to.equal(proposedCid);
		expect(approvals).to.equal(0n);
		expect(rejections).to.equal(0n);
		expect(Number(status)).to.equal(STATUS_OPEN);
		expect(storedMergedCommit).to.equal(
			"0x0000000000000000000000000000000000000000000000000000000000000000",
		);
		expect(storedMergedCid).to.equal("");
	});

	it("requires contributor role for proposal submission", async function () {
		const { registry, maintainer, contributor } = await loadFixture(deployFixture);
		await createRepo(registry, maintainer.account.address);

		await expectRevert(
			registry.write.submitProposal([repoId, proposedCommit, proposedCid], {
				account: contributor.account.address,
			}),
			"Contributor role required",
		);
	});

	it("enforces reviewer role and one-review-per-address", async function () {
		const { registry, maintainer, contributor, reviewer } = await loadFixture(deployFixture);
		await createRepo(registry, maintainer.account.address);
		await grantContributorRole(
			registry,
			maintainer.account.address,
			contributor.account.address,
		);
		await registry.write.submitProposal([repoId, proposedCommit, proposedCid], {
			account: contributor.account.address,
		});
		await grantReviewerRole(registry, maintainer.account.address, reviewer.account.address);
		await grantReviewerRole(registry, maintainer.account.address, contributor.account.address);
		await grantReviewerRole(registry, maintainer.account.address, maintainer.account.address);

		await expectRevert(
			registry.write.reviewProposal([repoId, 0n, true], {
				account: contributor.account.address,
			}),
			"Contributor cannot review",
		);
		await expectRevert(
			registry.write.reviewProposal([repoId, 0n, true], {
				account: maintainer.account.address,
			}),
			"Maintainer cannot review",
		);

		await registry.write.reviewProposal([repoId, 0n, true], {
			account: reviewer.account.address,
		});

		const [reviewExists, approved] = await registry.read.getReview([
			repoId,
			0n,
			reviewer.account.address,
		]);
		expect(reviewExists).to.equal(true);
		expect(approved).to.equal(true);

		await expectRevert(
			registry.write.reviewProposal([repoId, 0n, true], {
				account: reviewer.account.address,
			}),
			"Already reviewed",
		);
	});

	it("marks proposal as rejected when a reviewer rejects", async function () {
		const { registry, maintainer, contributor, reviewer } = await loadFixture(deployFixture);
		await createRepo(registry, maintainer.account.address);
		await grantContributorRole(
			registry,
			maintainer.account.address,
			contributor.account.address,
		);
		await grantReviewerRole(registry, maintainer.account.address, reviewer.account.address);
		await registry.write.submitProposal([repoId, proposedCommit, proposedCid], {
			account: contributor.account.address,
		});

		await registry.write.reviewProposal([repoId, 0n, false], {
			account: reviewer.account.address,
		});

		const [, , , approvals, rejections, status] = await registry.read.getProposal([repoId, 0n]);
		expect(approvals).to.equal(0n);
		expect(rejections).to.equal(1n);
		expect(Number(status)).to.equal(STATUS_REJECTED);

		await expectRevert(
			registry.write.mergeProposal([repoId, 0n, mergedCommit, mergedCid], {
				account: maintainer.account.address,
			}),
			"Proposal not open",
		);
	});

	it("merges approved proposal off-chain result and updates HEAD", async function () {
		const { registry, maintainer, contributor, reviewer, outsider } =
			await loadFixture(deployFixture);
		await createRepo(registry, maintainer.account.address);
		await grantContributorRole(
			registry,
			maintainer.account.address,
			contributor.account.address,
		);
		await grantReviewerRole(registry, maintainer.account.address, reviewer.account.address);
		await registry.write.submitProposal([repoId, proposedCommit, proposedCid], {
			account: contributor.account.address,
		});
		await registry.write.reviewProposal([repoId, 0n, true], {
			account: reviewer.account.address,
		});

		await expectRevert(
			registry.write.mergeProposal([repoId, 0n, mergedCommit, mergedCid], {
				account: outsider.account.address,
			}),
			"Only maintainer",
		);

		await registry.write.mergeProposal([repoId, 0n, mergedCommit, mergedCid], {
			account: maintainer.account.address,
		});

		const [, headCommit, headCid] = await registry.read.getRepo([repoId]);
		expect(headCommit).to.equal(mergedCommit);
		expect(headCid).to.equal(mergedCid);
		expect(await registry.read.isCanonicalCommit([repoId, mergedCommit])).to.equal(true);

		const [, , , approvals, rejections, status, finalCommit, finalCid] =
			await registry.read.getProposal([repoId, 0n]);
		expect(approvals).to.equal(1n);
		expect(rejections).to.equal(0n);
		expect(Number(status)).to.equal(STATUS_MERGED);
		expect(finalCommit).to.equal(mergedCommit);
		expect(finalCid).to.equal(mergedCid);
	});

	it("prevents merge before approval", async function () {
		const { registry, maintainer, contributor } = await loadFixture(deployFixture);
		await createRepo(registry, maintainer.account.address);
		await grantContributorRole(
			registry,
			maintainer.account.address,
			contributor.account.address,
		);
		await registry.write.submitProposal([repoId, proposedCommit, proposedCid], {
			account: contributor.account.address,
		});

		await expectRevert(
			registry.write.mergeProposal([repoId, 0n, proposedCommit, proposedCid], {
				account: maintainer.account.address,
			}),
			"Approval required",
		);
	});

	it("creates release only for canonical commit and keeps HEAD unchanged", async function () {
		const { registry, maintainer, contributor, reviewer, otherReviewer } =
			await loadFixture(deployFixture);
		await createRepo(registry, maintainer.account.address);
		await grantContributorRole(
			registry,
			maintainer.account.address,
			contributor.account.address,
		);
		await grantReviewerRole(registry, maintainer.account.address, reviewer.account.address);

		await expectRevert(
			registry.write.createRelease([repoId, version, proposedCommit, releaseCid], {
				account: maintainer.account.address,
			}),
			"Commit not canonical",
		);

		await registry.write.submitProposal([repoId, proposedCommit, proposedCid], {
			account: contributor.account.address,
		});
		await registry.write.reviewProposal([repoId, 0n, true], {
			account: reviewer.account.address,
		});
		await registry.write.mergeProposal([repoId, 0n, mergedCommit, mergedCid], {
			account: maintainer.account.address,
		});

		await expectRevert(
			registry.write.createRelease([repoId, version, mergedCommit, releaseCid], {
				account: otherReviewer.account.address,
			}),
			"Only maintainer",
		);

		await registry.write.createRelease([repoId, version, mergedCommit, releaseCid], {
			account: maintainer.account.address,
		});

		const [releaseCommit, storedReleaseCid] = await registry.read.getRelease([repoId, version]);
		expect(releaseCommit).to.equal(mergedCommit);
		expect(storedReleaseCid).to.equal(releaseCid);

		const [, headCommit, headCid, , releaseCount] = await registry.read.getRepo([repoId]);
		expect(headCommit).to.equal(mergedCommit);
		expect(headCid).to.equal(mergedCid);
		expect(releaseCount).to.equal(1n);

		await expectRevert(
			registry.write.createRelease([repoId, version, mergedCommit, releaseCid], {
				account: maintainer.account.address,
			}),
			"Release already exists",
		);
	});

	it("accrues pull-based contributor and reviewer rewards only after merge", async function () {
		const { registry, maintainer, contributor, reviewer } = await loadFixture(deployFixture);
		await createRepo(registry, maintainer.account.address);
		await grantContributorRole(
			registry,
			maintainer.account.address,
			contributor.account.address,
		);
		await grantReviewerRole(registry, maintainer.account.address, reviewer.account.address);

		const treasury = await hre.viem.deployContract("AperioIncentivesTreasury", [
			registry.address,
		]);

		await registry.write.setIncentiveTreasury([repoId, treasury.address], {
			account: maintainer.account.address,
		});

		await treasury.write.setPayoutConfig([repoId, parseEther("0.1"), parseEther("0.05")], {
			account: maintainer.account.address,
		});

		const donation = parseEther("1");
		await treasury.write.donate([repoId], { value: donation });
		expect(await treasury.read.getRepoBalance([repoId])).to.equal(donation);

		await registry.write.submitProposal([repoId, proposedCommit, proposedCid], {
			account: contributor.account.address,
		});
		await registry.write.reviewProposal([repoId, 0n, true], {
			account: reviewer.account.address,
		});

		expect(await treasury.read.getRepoBalance([repoId])).to.equal(donation);
		expect(await treasury.read.getClaimable([repoId, contributor.account.address])).to.equal(
			0n,
		);
		expect(await treasury.read.getClaimable([repoId, reviewer.account.address])).to.equal(0n);

		await registry.write.mergeProposal([repoId, 0n, mergedCommit, mergedCid], {
			account: maintainer.account.address,
		});

		expect(await treasury.read.getRepoBalance([repoId])).to.equal(parseEther("1"));
		expect(await treasury.read.getClaimable([repoId, contributor.account.address])).to.equal(
			parseEther("0.1"),
		);
		expect(await treasury.read.getClaimable([repoId, reviewer.account.address])).to.equal(
			parseEther("0.05"),
		);
		expect(await treasury.read.getTotalClaimable([contributor.account.address])).to.equal(
			parseEther("0.1"),
		);
		expect(await treasury.read.getTotalClaimable([reviewer.account.address])).to.equal(
			parseEther("0.05"),
		);
		expect(await treasury.read.getRepoTotalClaimable([repoId])).to.equal(parseEther("0.15"));
		expect(await treasury.read.getRepoUnfundedClaimable([repoId])).to.equal(0n);

		await treasury.write.claim([repoId], {
			account: contributor.account.address,
		});
		expect(await treasury.read.getClaimable([repoId, contributor.account.address])).to.equal(
			0n,
		);
		expect(await treasury.read.getTotalClaimable([contributor.account.address])).to.equal(0n);
		expect(await treasury.read.getRepoBalance([repoId])).to.equal(parseEther("0.9"));

		await treasury.write.claim([repoId], {
			account: reviewer.account.address,
		});
		expect(await treasury.read.getClaimable([repoId, reviewer.account.address])).to.equal(0n);
		expect(await treasury.read.getTotalClaimable([reviewer.account.address])).to.equal(0n);
		expect(await treasury.read.getRepoBalance([repoId])).to.equal(parseEther("0.85"));
		expect(await treasury.read.getRepoTotalClaimable([repoId])).to.equal(0n);
	});

	it("does not accrue rewards for rejected proposals", async function () {
		const { registry, maintainer, contributor, reviewer } = await loadFixture(deployFixture);
		await createRepo(registry, maintainer.account.address);
		await grantContributorRole(
			registry,
			maintainer.account.address,
			contributor.account.address,
		);
		await grantReviewerRole(registry, maintainer.account.address, reviewer.account.address);

		const treasury = await hre.viem.deployContract("AperioIncentivesTreasury", [
			registry.address,
		]);

		await registry.write.setIncentiveTreasury([repoId, treasury.address], {
			account: maintainer.account.address,
		});
		await treasury.write.setPayoutConfig([repoId, parseEther("0.1"), parseEther("0.05")], {
			account: maintainer.account.address,
		});
		await treasury.write.donate([repoId], { value: parseEther("1") });

		await registry.write.submitProposal([repoId, proposedCommit, proposedCid], {
			account: contributor.account.address,
		});
		await registry.write.reviewProposal([repoId, 0n, false], {
			account: reviewer.account.address,
		});

		expect(await treasury.read.getRepoBalance([repoId])).to.equal(parseEther("1"));
		expect(await treasury.read.getClaimable([repoId, contributor.account.address])).to.equal(
			0n,
		);
		expect(await treasury.read.getClaimable([repoId, reviewer.account.address])).to.equal(0n);
		expect(await treasury.read.hasProposalBeenRewarded([repoId, 0n])).to.equal(false);
	});

	it("accrues fixed rewards even if underfunded and allows claiming after new donations", async function () {
		const { registry, maintainer, contributor, reviewer } = await loadFixture(deployFixture);
		await createRepo(registry, maintainer.account.address);
		await grantContributorRole(
			registry,
			maintainer.account.address,
			contributor.account.address,
		);
		await grantReviewerRole(registry, maintainer.account.address, reviewer.account.address);

		const treasury = await hre.viem.deployContract("AperioIncentivesTreasury", [
			registry.address,
		]);

		await registry.write.setIncentiveTreasury([repoId, treasury.address], {
			account: maintainer.account.address,
		});
		await treasury.write.setPayoutConfig([repoId, parseEther("0.1"), parseEther("0.05")], {
			account: maintainer.account.address,
		});

		// Underfund the repo intentionally.
		await treasury.write.donate([repoId], { value: parseEther("0.05") });

		await registry.write.submitProposal([repoId, proposedCommit, proposedCid], {
			account: contributor.account.address,
		});
		await registry.write.reviewProposal([repoId, 0n, true], {
			account: reviewer.account.address,
		});
		await registry.write.mergeProposal([repoId, 0n, mergedCommit, mergedCid], {
			account: maintainer.account.address,
		});

		// Rewards accrue despite low treasury balance.
		expect(await treasury.read.getClaimable([repoId, contributor.account.address])).to.equal(
			parseEther("0.1"),
		);
		expect(await treasury.read.getClaimable([repoId, reviewer.account.address])).to.equal(
			parseEther("0.05"),
		);
		expect(await treasury.read.getRepoBalance([repoId])).to.equal(parseEther("0.05"));
		expect(await treasury.read.getRepoTotalClaimable([repoId])).to.equal(parseEther("0.15"));
		expect(await treasury.read.getRepoUnfundedClaimable([repoId])).to.equal(parseEther("0.1"));

		await expectRevert(
			treasury.write.claim([repoId], { account: contributor.account.address }),
			"Insufficient funded balance",
		);

		// New donations allow claims to complete.
		await treasury.write.donate([repoId], { value: parseEther("0.2") });
		await treasury.write.claim([repoId], { account: contributor.account.address });
		await treasury.write.claim([repoId], { account: reviewer.account.address });

		expect(await treasury.read.getRepoBalance([repoId])).to.equal(parseEther("0.1"));
		expect(await treasury.read.getRepoTotalClaimable([repoId])).to.equal(0n);
		expect(await treasury.read.getRepoUnfundedClaimable([repoId])).to.equal(0n);
	});
});
