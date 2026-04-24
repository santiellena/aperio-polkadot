import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { asset_hub_paseo } from "@polkadot-api/descriptors";
import { Binary, FixedSizeBinary } from "polkadot-api";
import { encodeFunctionData, keccak256, type Abi } from "viem";
import { getPublicClient } from "../config/evm";
import { getStoredEthRpcUrl } from "../config/network";
import { useSubstrateSession } from "../features/auth/useSubstrateSession";
import { useWalletSession } from "../features/auth/useWalletSession";
import { MergePanel } from "../features/maintainer/MergePanel";
import { useRepoOverview } from "../features/repo/useRepoOverview";
import { getClient } from "../hooks/useChain";
import {
	buildBundleUrl,
	aperioRegistryAbi,
	formatGitCommitHash,
	formatRepoTimestamp,
	getRegistryAddress,
	readRepoProposals,
	shortenAddress,
	type RepoProposal,
} from "../lib/aperio";
import { useChainStore } from "../store/chainStore";

type ReviewReadResult = readonly [boolean, boolean];
type ProposalEntry = RepoProposal & { reviewerVote: { exists: boolean; approved: boolean } | null };

const STATUS_LABEL: Record<number, string> = { 1: "Open", 2: "Rejected", 3: "Merged" };
const STATUS_CLASS: Record<number, string> = {
	1: "border-blue-500/30 bg-blue-500/10 text-blue-300",
	2: "border-red-500/30 bg-red-500/10 text-red-300",
	3: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

export default function RepoProposalsRoute() {
	const { organization: rawOrg, repository: rawRepo } = useParams();
	const { account, getWalletClientForWrite } = useWalletSession();
	const { browserAccounts, selectedBrowserAccountIndex } = useSubstrateSession();
	const wsUrl = useChainStore((s) => s.wsUrl);
	const substrateAccount = browserAccounts[selectedBrowserAccountIndex] ?? null;
	const substrateH160 = substrateAccount
		? (`0x${keccak256(substrateAccount.polkadotSigner.publicKey).slice(-40)}` as `0x${string}`)
		: null;
	const effectiveAccount = substrateH160 ?? account;
	const {
		repo,
		loading: repoLoading,
		refresh: refreshRepo,
	} = useRepoOverview(rawOrg, rawRepo, effectiveAccount);

	const [proposals, setProposals] = useState<ProposalEntry[]>([]);
	const [proposalsLoading, setProposalsLoading] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);
	const [submittingId, setSubmittingId] = useState<number | null>(null);
	const [txStatus, setTxStatus] = useState<Record<number, string>>({});

	const refresh = useCallback(() => {
		setRefreshKey((k) => k + 1);
		void refreshRepo();
	}, [refreshRepo]);

	useEffect(() => {
		if (!repo) {
			setProposals([]);
			return;
		}
		if (repo.proposalCount === 0n) {
			setProposals([]);
			setProposalsLoading(false);
			return;
		}

		let cancelled = false;
		setProposalsLoading(true);

		const fetchProposals = async () => {
			const client = getPublicClient(getStoredEthRpcUrl());
			const registryAddress = getRegistryAddress();
			const count = Number(repo.proposalCount);
			const ids = Array.from({ length: count }, (_, i) => i);

			const [proposalResults, reviewResults] = await Promise.all([
				readRepoProposals(repo.repoId),
				effectiveAccount && repo.roles.isReviewer
					? Promise.all(
							ids.map(
								(i) =>
									client.readContract({
										address: registryAddress,
										abi: aperioRegistryAbi,
										functionName: "getReview",
										args: [repo.repoId, BigInt(i), effectiveAccount],
									}) as Promise<ReviewReadResult>,
							),
						)
					: Promise.resolve(null),
			]);

			if (cancelled) return;

			const entries: ProposalEntry[] = proposalResults.map((proposal) => ({
				...proposal,
				reviewerVote: reviewResults
					? {
							exists: reviewResults[Number(proposal.id)]?.[0] ?? false,
							approved: reviewResults[Number(proposal.id)]?.[1] ?? false,
						}
					: null,
			}));

			setProposals(entries);
			setProposalsLoading(false);
		};

		void fetchProposals().catch(() => setProposalsLoading(false));
		return () => {
			cancelled = true;
		};
	}, [effectiveAccount, refreshKey, repo]);

	const submitReview = async (proposalId: number, approved: boolean) => {
		if (!repo) return;

		setSubmittingId(proposalId);
		setTxStatus((prev) => ({
			...prev,
			[proposalId]: approved ? "Submitting approval..." : "Submitting rejection...",
		}));

		try {
			const publicClient = getPublicClient(getStoredEthRpcUrl());
			const registryAddress = getRegistryAddress();

			if (account) {
				const walletClient = await getWalletClientForWrite();
				if (!walletClient.account) throw new Error("No EVM signer available");

				const hash = await walletClient.writeContract({
					address: registryAddress,
					abi: aperioRegistryAbi,
					functionName: "reviewProposal",
					args: [repo.repoId, BigInt(proposalId), approved],
					account: walletClient.account,
					chain: walletClient.chain,
				});
				await publicClient.waitForTransactionReceipt({ hash });
			} else if (substrateAccount) {
				const calldata = encodeFunctionData({
					abi: aperioRegistryAbi as Abi,
					functionName: "reviewProposal",
					args: [repo.repoId, BigInt(proposalId), approved],
				});
				const api = getClient(wsUrl).getTypedApi(asset_hub_paseo);
				const tx = api.tx.Revive.call({
					dest: FixedSizeBinary.fromHex(registryAddress),
					value: 0n,
					weight_limit: { ref_time: 500_000_000_000n, proof_size: 5_000_000n },
					storage_deposit_limit: 10_000_000_000_000n,
					data: Binary.fromHex(calldata),
				});
				await new Promise<void>((resolve, reject) => {
					tx.signSubmitAndWatch(substrateAccount.polkadotSigner).subscribe({
						next: (ev) => {
							if (ev.type === "txBestBlocksState" && ev.found) resolve();
						},
						error: reject,
					});
				});
			} else {
				throw new Error("No transaction signer is available");
			}

			setTxStatus((prev) => ({
				...prev,
				[proposalId]: approved ? "Approved." : "Rejected.",
			}));

			setProposals((prev) =>
				prev.map((p) =>
					p.id === BigInt(proposalId)
						? {
								...p,
								approvals: approved ? p.approvals + 1n : p.approvals,
								rejections: approved ? p.rejections : p.rejections + 1n,
								status: approved ? p.status : 2,
								reviewerVote: { exists: true, approved },
							}
						: p,
				),
			);
		} catch (cause) {
			setTxStatus((prev) => ({
				...prev,
				[proposalId]: cause instanceof Error ? cause.message : "Review failed",
			}));
		} finally {
			setSubmittingId(null);
		}
	};

	if (repoLoading) {
		return <div className="card animate-pulse h-40" />;
	}

	if (!repo) {
		return (
			<div className="card">
				<h1 className="section-title">Repository Unavailable</h1>
				<p className="mt-3 text-sm text-accent-red">Repository not found</p>
			</div>
		);
	}

	const repoLink = `/repo/${encodeURIComponent(repo.organization)}/${encodeURIComponent(repo.repository)}`;
	const canPropose = repo.permissionlessContributions || repo.roles.isContributor;

	return (
		<div className="space-y-6">
			<section className="space-y-3">
				<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
					<div>
						<h1 className="page-title">Proposals</h1>
						<p className="mt-2 text-text-secondary break-all">
							{repo.organization}/{repo.repository}
						</p>
						<p className="mt-1 text-text-tertiary font-mono text-sm">
							{proposals.length} of {repo.proposalCount.toString()} proposals
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<button onClick={refresh} className="btn-secondary">
							Refresh
						</button>
						{canPropose ? (
							<Link to={`${repoLink}/propose`} className="btn-primary">
								Submit Proposal
							</Link>
						) : null}
						<Link to={repoLink} className="btn-secondary">
							Back To Repository
						</Link>
					</div>
				</div>
				{repo.roles.isReviewer && !repo.roles.isMaintainer ? (
					<div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-text-secondary">
						You have the reviewer role. Fetch a proposal bundle, inspect the changes,
						then submit your approval or rejection.
					</div>
				) : null}
			</section>

			{proposalsLoading ? (
				<div className="space-y-3">
					{[0, 1, 2].map((n) => (
						<div key={n} className="card animate-pulse h-32" />
					))}
				</div>
			) : proposals.length === 0 ? (
				<div className="card py-10 text-center text-sm text-text-secondary">
					No proposals have been submitted yet.
				</div>
			) : (
				<div className="space-y-3">
					{proposals.map((proposal) => {
						const isOwnProposal =
							effectiveAccount?.toLowerCase() === proposal.contributor.toLowerCase();
						const canReview =
							repo.roles.isReviewer &&
							//!repo.roles.isMaintainer &&
							// !isOwnProposal &&
							proposal.status === 1 &&
							!proposal.reviewerVote?.exists;
						const bundleUrl = buildBundleUrl(proposal.proposedCid);
						const mergedBundleUrl = proposal.mergedCid
							? buildBundleUrl(proposal.mergedCid)
							: null;
						const statusClass =
							STATUS_CLASS[proposal.status] ??
							"border-white/[0.06] bg-white/[0.03] text-text-secondary";
						const statusLabel = STATUS_LABEL[proposal.status] ?? "Unknown";
						const proposalNumber = Number(proposal.id);
						const proposalTxStatus = txStatus[proposalNumber];
						const isSubmitting = submittingId === proposalNumber;

						return (
							<div key={proposal.id.toString()} className="card space-y-4">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="flex flex-wrap items-center gap-2">
										<span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 font-mono text-xs text-text-muted">
											#{proposal.id.toString()}
										</span>
										<span
											className={`rounded-md border px-2 py-0.5 text-xs font-medium ${statusClass}`}
										>
											{statusLabel}
										</span>
										{isOwnProposal ? (
											<span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
												Your submission
											</span>
										) : null}
									</div>
									<div className="flex items-center gap-2 text-xs text-text-tertiary">
										<span className="text-emerald-400">
											↑ {proposal.approvals.toString()}
										</span>
										<span>·</span>
										<span className="text-red-400">
											↓ {proposal.rejections.toString()}
										</span>
									</div>
								</div>

								<div className="grid gap-3 md:grid-cols-2">
									<InfoRow
										label="Contributor"
										value={shortenAddress(proposal.contributor)}
										mono
									/>
									<InfoRow
										label="Proposed Commit"
										value={formatGitCommitHash(proposal.proposedCommit)}
										mono
									/>
									<InfoRow
										label="Proposed CID"
										value={proposal.proposedCid}
										mono
									/>
									<InfoRow
										label="Submitted"
										value={formatRepoTimestamp(proposal.submittedAt)}
									/>
									<InfoRow
										label="Last Review"
										value={formatRepoTimestamp(proposal.lastReviewedAt)}
									/>
									{proposal.status === 3 ? (
										<>
											<InfoRow
												label="Merged Commit"
												value={formatGitCommitHash(proposal.mergedCommit)}
												mono
											/>
											<InfoRow
												label="Merged CID"
												value={proposal.mergedCid}
												mono
											/>
											<InfoRow
												label="Merged At"
												value={formatRepoTimestamp(proposal.mergedAt)}
											/>
										</>
									) : null}
								</div>

								<div className="space-y-3">
									{bundleUrl ? (
										<BundleCommandBlock
											label="Fetch proposed bundle"
											url={bundleUrl}
											fileName={`proposal-${proposal.id.toString()}.bundle`}
										/>
									) : null}
									{mergedBundleUrl && proposal.status === 3 ? (
										<BundleCommandBlock
											label="Fetch merged bundle"
											url={mergedBundleUrl}
											fileName={`proposal-${proposal.id.toString()}-merged.bundle`}
										/>
									) : null}
								</div>

								{repo.roles.isMaintainer && proposal.status === 1 ? (
									<MergePanel
										repoId={repo.repoId}
										proposalId={proposalNumber}
										proposedCommit={proposal.proposedCommit}
										proposedCid={proposal.proposedCid}
										canMerge={
											proposal.approvals > 0n && proposal.rejections === 0n
										}
										onMerged={refresh}
									/>
								) : null}

								{repo.roles.isReviewer /*&& !repo.roles.isMaintainer*/ ? (
									<div className="border-t border-white/[0.06] pt-3">
										{proposal.reviewerVote?.exists ? (
											<span
												className={`text-sm ${proposal.reviewerVote.approved ? "text-emerald-400" : "text-red-400"}`}
											>
												You{" "}
												{proposal.reviewerVote.approved
													? "approved"
													: "rejected"}{" "}
												this proposal.
												{proposalTxStatus ? ` ${proposalTxStatus}` : ""}
											</span>
										) : // : isOwnProposal ? (
										// 	<span className="text-sm text-text-tertiary">
										// 		You cannot review your own proposal.
										// 	</span>
										// )
										proposal.status !== 1 ? (
											<span className="text-sm text-text-tertiary">
												This proposal is no longer open for review.
											</span>
										) : canReview ? (
											<div className="space-y-3">
												<div className="text-sm font-medium text-text-primary">
													Submit Your Review
												</div>
												<div className="grid gap-3 sm:grid-cols-2">
													<ReviewOption
														variant="approve"
														title="Looks Good"
														description="Endorse this proposal. The maintainer will decide whether to merge it — your approval does not trigger a merge."
														label={
															isSubmitting ? "Submitting…" : "Approve"
														}
														onClick={() =>
															void submitReview(proposalNumber, true)
														}
														disabled={isSubmitting}
													/>
													<ReviewOption
														variant="reject"
														title="Not Relevant"
														description="Close this proposal permanently. Use this when the contribution doesn't make sense or isn't ready."
														label={
															isSubmitting ? "Submitting…" : "Reject"
														}
														onClick={() =>
															void submitReview(proposalNumber, false)
														}
														disabled={isSubmitting}
													/>
												</div>
												{proposalTxStatus ? (
													<div className="break-all text-sm text-text-secondary">
														{proposalTxStatus}
													</div>
												) : null}
											</div>
										) : null}
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

function ReviewOption({
	variant,
	title,
	description,
	label,
	onClick,
	disabled,
}: {
	variant: "approve" | "reject";
	title: string;
	description: string;
	label: string;
	onClick: () => void;
	disabled: boolean;
}) {
	const styles =
		variant === "approve"
			? {
					card: "border-emerald-500/20 bg-emerald-500/5",
					title: "text-emerald-300",
					button: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
				}
			: {
					card: "border-red-500/20 bg-red-500/5",
					title: "text-red-300",
					button: "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
				};

	return (
		<div className={`space-y-2 rounded-lg border p-3 ${styles.card}`}>
			<div className={`text-sm font-medium ${styles.title}`}>{title}</div>
			<p className="text-xs text-text-secondary">{description}</p>
			<button
				onClick={onClick}
				disabled={disabled}
				className={`w-full rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${styles.button}`}
			>
				{label}
			</button>
		</div>
	);
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
	return (
		<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
			<div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{label}</div>
			<div className={`mt-1 break-all text-sm text-text-primary ${mono ? "font-mono" : ""}`}>
				{value || "—"}
			</div>
		</div>
	);
}

function BundleCommandBlock({
	label,
	url,
	fileName,
}: {
	label: string;
	url: string;
	fileName: string;
}) {
	return (
		<div className="space-y-2">
			<div className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
				{label}
			</div>
			<pre className="overflow-x-auto rounded-lg border border-white/[0.06] bg-black/20 p-3 text-xs text-text-primary">
				<code>{`curl -L "${url}" -o ${fileName}`}</code>
			</pre>
		</div>
	);
}
