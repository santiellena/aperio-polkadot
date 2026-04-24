import { Link, useParams } from "react-router-dom";
import { keccak256 } from "viem";
import { useWalletSession } from "../features/auth/useWalletSession";
import { useSubstrateSession } from "../features/auth/useSubstrateSession";
import { LeaderboardTable } from "../features/leaderboard/LeaderboardTable";
import { useRepoLeaderboard } from "../features/leaderboard/useLeaderboards";
import { MaintainerPanel } from "../features/maintainer/MaintainerPanel";
import { useRepoOverview } from "../features/repo/useRepoOverview";
import { TreasuryDonationCard } from "../features/treasury/TreasuryDonationCard";
import {
	formatEthAmount,
	formatGitCommitHash,
	formatRepoTimestamp,
	shortenAddress,
	shortenHash,
} from "../lib/aperio";

export default function RepoRoute() {
	const { organization, repository } = useParams();
	const { account, sourceLabel } = useWalletSession();
	const { browserAccounts, selectedBrowserAccountIndex, browserSourceLabel } =
		useSubstrateSession();
	const substrateAccount = browserAccounts[selectedBrowserAccountIndex] ?? null;
	const substrateH160 = substrateAccount
		? (`0x${keccak256(substrateAccount.polkadotSigner.publicKey).slice(-40)}` as `0x${string}`)
		: null;
	const effectiveAccount = substrateH160 ?? account;
	const signedInLabel = substrateAccount
		? `${(browserSourceLabel ?? substrateAccount.name) || "Polkadot wallet"}: ${substrateAccount.address}`
		: account
			? `${sourceLabel}: ${account}`
			: "Using local dev fallback";
	const { repo, loading, error, refresh } = useRepoOverview(
		organization,
		repository,
		effectiveAccount,
	);
	const { entries: leaderboardEntries, loading: leaderboardLoading } = useRepoLeaderboard(
		repo?.repoId,
		repo?.organization,
		repo?.repository,
		repo?.treasuryAddress,
	);

	if (loading) {
		return <div className="card animate-pulse h-40" />;
	}

	if (error || !repo) {
		return (
			<div className="card">
				<h1 className="section-title">Repository Unavailable</h1>
				<p className="mt-3 text-sm text-accent-red">{error || "Repository not found"}</p>
			</div>
		);
	}

	const recentTimestamp = repo.commitList[0]?.timestamp ?? null;
	const recentHistory = repo.commitList.slice(0, 3);
	const mergedCount = Math.max(repo.commitList.length - 1, 0);
	const bundleFileName = `aperio-${repo.repoId.slice(2, 10)}.bundle`;
	const recommendedAction = repo.roles.isMaintainer
		? "Maintain canonical HEAD, manage roles, and merge accepted proposals."
		: repo.roles.isReviewer
			? "Review proposal bundles off-chain, then record approvals or rejections."
			: repo.permissionlessContributions || repo.roles.isContributor
				? "Prepare a Git bundle and submit a proposal against the current HEAD."
				: "You can inspect canonical state, but proposing changes requires contributor access.";

	return (
		<div className="space-y-6">
			<section className="hero-card">
				<div className="relative z-10 grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
					<div className="space-y-5">
						<div>
							<div className="eyebrow">Canonical Repository State</div>
							<h1 className="page-title mt-2">
								{repo.organization}/{repo.repository}
							</h1>
							<p className="mt-3 max-w-3xl text-text-secondary">
								The contract records the selected `HEAD`, proposal counters,
								releases, and role permissions. Repository code remains off-chain
								and is addressed by CID.
							</p>
							<p className="mt-3 break-all font-mono text-xs text-text-tertiary">
								{repo.repoId}
							</p>
						</div>
						<div className="grid gap-3 md:grid-cols-3">
							<StateStat
								label="Canonical HEAD"
								value={shortenHash(formatGitCommitHash(repo.latestCommitHash))}
								description="Current commit selected by the registry."
							/>
							<StateStat
								label="Artifact CID"
								value={repo.latestCid ? shortenHash(repo.latestCid) : "Unavailable"}
								description="Off-chain bundle pointer for the latest state."
							/>
							<StateStat
								label="Workflow"
								value={`${repo.proposalCount.toString()} proposals`}
								description={`${mergedCount} merged change${mergedCount === 1 ? "" : "s"} recorded in history.`}
							/>
						</div>
						<div className="flex flex-wrap gap-3">
							<span className="status-chip border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
								HEAD canonical
							</span>
							<span className="status-chip border-blue-500/20 bg-blue-500/10 text-blue-200">
								{repo.latestCid ? "Bundle linked" : "No bundle linked"}
							</span>
							<span className="status-chip border-white/[0.08] bg-white/[0.04] text-text-secondary">
								{repo.permissionlessContributions
									? "Open contributions"
									: "Whitelisted contributions"}
							</span>
						</div>
					</div>
					<div className="card space-y-4">
						<div>
							<div className="eyebrow">Role Surface</div>
							<h2 className="section-title mt-2">What you can do here</h2>
						</div>
						<div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-sm leading-relaxed text-text-secondary">
							{recommendedAction}
						</div>
						<div className="space-y-2">
							<RoleBadge label="Maintainer" active={repo.roles.isMaintainer} />
							<RoleBadge
								label="Contributor"
								active={
									repo.roles.isContributor || repo.permissionlessContributions
								}
							/>
							<RoleBadge label="Reviewer" active={repo.roles.isReviewer} />
						</div>
						<div className="text-sm text-text-secondary">
							<div className="panel-label">Signed-in account</div>
							<div className="mt-2 break-all font-mono text-text-primary">
								{signedInLabel}
							</div>
						</div>
					</div>
				</div>
			</section>

			<section className="flex flex-wrap gap-2">
				<Link
					to={`/repo/${encodeURIComponent(repo.organization)}/${encodeURIComponent(repo.repository)}/proposals`}
					className="btn-secondary"
				>
					Proposals
					{repo.proposalCount > 0n ? (
						<span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-xs">
							{repo.proposalCount.toString()}
						</span>
					) : null}
				</Link>
				<Link
					to={`/repo/${encodeURIComponent(repo.organization)}/${encodeURIComponent(repo.repository)}/history`}
					className="btn-secondary"
				>
					View History
				</Link>
				<span className="btn-secondary cursor-not-allowed opacity-40" title="Coming soon">
					Tree
				</span>
				<Link
					to={`/repo/${encodeURIComponent(repo.organization)}/${encodeURIComponent(repo.repository)}/leaderboard`}
					className="btn-secondary"
				>
					Leaderboard
				</Link>
				{repo.permissionlessContributions || repo.roles.isContributor ? (
					<Link
						to={`/repo/${encodeURIComponent(repo.organization)}/${encodeURIComponent(repo.repository)}/propose`}
						className="btn-primary"
					>
						Submit Proposal
					</Link>
				) : null}
			</section>

			<section className="grid gap-4 xl:grid-cols-[1.35fr_0.95fr]">
				<div className="card space-y-4">
					<div>
						<div className="eyebrow">Canonical state</div>
						<h2 className="section-title mt-2">Selected by the contract</h2>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<DataPanel
							label="Latest commit"
							value={formatGitCommitHash(repo.latestCommitHash)}
							mono
						/>
						<DataPanel label="Latest CID" value={repo.latestCid || "Not set"} mono />
						<DataPanel label="Maintainer" value={repo.maintainer} mono />
						<DataPanel
							label="Treasury"
							value={repo.treasuryAddress || "Not configured"}
							mono
						/>
						<DataPanel label="Registry" value={repo.registryAddress} mono />
						<DataPanel
							label="Treasury balance"
							value={formatEthAmount(repo.treasuryBalance)}
						/>
					</div>
				</div>

				<div className="card space-y-4">
					<div>
						<div className="eyebrow">Workflow queue</div>
						<h2 className="section-title mt-2">Repository activity</h2>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<QueueCard label="Total proposals" value={repo.proposalCount.toString()} />
						<QueueCard label="Releases" value={repo.releaseCount.toString()} />
						<QueueCard label="Merged commits" value={mergedCount.toString()} />
						<QueueCard
							label="Last canonical update"
							value={formatRepoTimestamp(recentTimestamp)}
						/>
					</div>
					<div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-sm text-text-secondary">
						Next step:
						<span className="ml-2 text-text-primary">
							{repo.roles.isMaintainer
								? "Review proposals and merge final commits off-chain."
								: repo.roles.isReviewer
									? "Download a bundle, inspect code locally, then submit your decision."
									: repo.permissionlessContributions || repo.roles.isContributor
										? "Prepare a bundle against the current HEAD and submit a proposal."
										: "Inspect history, releases, and treasury state from the canonical surface."}
						</span>
					</div>
				</div>
			</section>

			<section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
				<div className="card space-y-4">
					<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
						<div>
							<div className="eyebrow">Artifacts</div>
							<h2 className="section-title mt-2">Fetch and reconstruct</h2>
							<p className="mt-1 text-sm text-text-secondary">
								Artifacts are Git bundles. Fetch the latest CID and reconstruct
								repository state locally before reviewing or reusing it.
							</p>
						</div>
						<button onClick={refresh} className="btn-secondary">
							Refresh State
						</button>
					</div>

					{repo.cloneUrl ? (
						<>
							<div className="card-muted">
								<div className="panel-label">Resolved bundle URL</div>
								<div className="mt-2 break-all font-mono text-xs text-text-secondary">
									{repo.cloneUrl}
								</div>
							</div>
							<CommandBlock
								command={`# Download the latest canonical bundle
curl -L ${repo.cloneUrl} -o ${bundleFileName}

# Clone into a fresh repository
git clone ${bundleFileName} aperio-${repo.repoId.slice(2, 10)}
cd aperio-${repo.repoId.slice(2, 10)}
git checkout main

# Or fetch into an existing clone
cd /path/to/your/existing-repo
git bundle list-heads ../${bundleFileName}
git fetch ../${bundleFileName} main:bundle-main
git log bundle-main --oneline`}
							/>
						</>
					) : (
						<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-text-secondary">
							No latest CID is available yet, so the web app cannot offer bundle
							download instructions.
						</div>
					)}
				</div>

				<div className="card space-y-4">
					<div>
						<div className="eyebrow">Recent activity</div>
						<h2 className="section-title mt-2">Canonical timeline</h2>
					</div>
					<div className="space-y-3">
						{recentHistory.map((entry) => (
							<div
								key={`${entry.type}-${entry.commitHash}-${entry.blockNumber?.toString() ?? "na"}`}
								className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4"
							>
								<div className="flex items-center justify-between gap-3">
									<div className="text-sm font-medium text-text-primary">
										{entry.type === "initial"
											? "Repository created"
											: "Merged proposal"}
									</div>
									<div className="text-xs text-text-tertiary">
										{formatRepoTimestamp(entry.timestamp)}
									</div>
								</div>
								<div className="mt-3 break-all font-mono text-xs text-text-primary">
									{formatGitCommitHash(entry.commitHash)}
								</div>
								<div className="mt-2 text-xs text-text-secondary">
									Actor {shortenAddress(entry.actor)}
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			<section className="card space-y-4">
				<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
					<div>
						<div className="eyebrow">Incentives</div>
						<h2 className="section-title mt-2">Top earners</h2>
						<p className="mt-1 text-sm text-text-secondary">
							Read from the repository treasury event stream.
						</p>
					</div>
					<Link
						to={`/repo/${encodeURIComponent(repo.organization)}/${encodeURIComponent(repo.repository)}/leaderboard`}
						className="btn-secondary"
					>
						Open Full Leaderboard
					</Link>
				</div>
				{leaderboardLoading ? (
					<div className="h-24 animate-pulse rounded-lg bg-white/[0.03]" />
				) : null}
				{!leaderboardLoading ? (
					<LeaderboardTable
						entries={leaderboardEntries.slice(0, 3)}
						emptyMessage="No rewards have been accrued for this repository yet."
						showRepoBreakdown={false}
					/>
				) : null}
			</section>

			{repo.roles.isMaintainer ? (
				<MaintainerPanel
					repoId={repo.repoId}
					permissionlessContributions={repo.permissionlessContributions}
					onUpdated={refresh}
				/>
			) : null}

			<TreasuryDonationCard
				repoId={repo.repoId}
				treasuryAddress={repo.treasuryAddress}
				balance={repo.treasuryBalance}
				contributionReward={repo.contributionReward}
				reviewReward={repo.reviewReward}
				totalClaimable={repo.totalClaimable}
				unfundedClaimable={repo.unfundedClaimable}
				userClaimable={repo.userClaimable}
				canClaimRewards={repo.roles.isContributor || repo.roles.isReviewer}
				onDonated={refresh}
			/>
		</div>
	);
}

function StateStat({
	label,
	value,
	description,
}: {
	label: string;
	value: string;
	description: string;
}) {
	return (
		<div className="card-muted">
			<div className="panel-label">{label}</div>
			<div className="mt-2 text-lg font-semibold text-text-primary">{value}</div>
			<div className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</div>
		</div>
	);
}

function DataPanel({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="card-muted">
			<div className="panel-label">{label}</div>
			<div className={`mt-2 break-all text-sm text-text-primary ${mono ? "font-mono" : ""}`}>
				{value || "Unavailable"}
			</div>
		</div>
	);
}

function RoleBadge({ label, active }: { label: string; active: boolean }) {
	return (
		<div
			className={`rounded-lg border px-3 py-2 text-sm ${
				active
					? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
					: "border-white/[0.06] bg-white/[0.03] text-text-secondary"
			}`}
		>
			{label}
		</div>
	);
}

function QueueCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="card-muted">
			<div className="panel-label">{label}</div>
			<div className="mt-2 text-base font-semibold text-text-primary">{value}</div>
		</div>
	);
}

function CommandBlock({ command }: { command: string }) {
	return (
		<pre className="w-full overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-white/[0.06] bg-black/30 p-4 text-xs text-text-primary">
			<code>{command}</code>
		</pre>
	);
}
