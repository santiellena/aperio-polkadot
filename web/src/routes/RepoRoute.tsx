import { Link, useParams } from "react-router-dom";
import { useWalletSession } from "../features/auth/useWalletSession";
import { useRepoOverview } from "../features/repo/useRepoOverview";
import { TreasuryDonationCard } from "../features/treasury/TreasuryDonationCard";
import {
	formatEthAmount,
	formatRepoTimestamp,
	shortenAddress,
	shortenHash,
} from "../lib/crrp";

export default function RepoRoute() {
	const { organization, repository } = useParams();
	const { account } = useWalletSession();
	const { repo, loading, error } = useRepoOverview(organization, repository, account);

	if (loading) {
		return <div className="card animate-pulse h-40" />;
	}

	if (error || !repo) {
		return (
			<div className="card">
				<h1 className="section-title">Repository Unavailable</h1>
				<p className="text-sm text-accent-red mt-3">{error || "Repository not found"}</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<section className="space-y-3">
				<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
					<div>
						<h1 className="page-title">Repository Overview</h1>
						<p className="mt-2 text-text-secondary break-all">
							{repo.organization}/{repo.repository}
						</p>
						<p className="mt-1 text-text-tertiary font-mono break-all">{repo.repoId}</p>
					</div>
					<div className="flex gap-2">
						<Link
							to={`/repo/${encodeURIComponent(repo.organization)}/${encodeURIComponent(repo.repository)}/history`}
							className="btn-secondary"
						>
							View History
						</Link>
						<Link
							to={`/repo/${encodeURIComponent(repo.organization)}/${encodeURIComponent(repo.repository)}/tree`}
							className="btn-secondary"
						>
							Tree
						</Link>
					</div>
				</div>
				<p className="text-text-secondary max-w-3xl">
					The registry stores the canonical `HEAD`, proposal counters, roles, and the
					treasury pointer. Code stays off-chain and is referenced by CID.
				</p>
			</section>

			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<ValueCard label="Maintainer" value={repo.maintainer} mono />
				<ValueCard label="Organization" value={repo.organization} />
				<ValueCard label="Repository" value={repo.repository} />
				<ValueCard label="Latest Commit" value={repo.latestCommitHash} mono />
				<ValueCard label="Latest CID" value={repo.latestCid || "Not set"} mono />
				<ValueCard label="Treasury" value={repo.treasuryAddress || "Not configured"} mono />
				<ValueCard label="Proposal Count" value={repo.proposalCount.toString()} />
				<ValueCard label="Release Count" value={repo.releaseCount.toString()} />
				<ValueCard label="Treasury Balance" value={formatEthAmount(repo.treasuryBalance)} />
				<ValueCard label="Registry" value={repo.registryAddress} mono />
			</section>

			<section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
				<div className="card space-y-4">
					<div>
						<h2 className="section-title">Download And Clone</h2>
						<p className="text-sm text-text-secondary mt-1">
							Artifacts are Git bundles. Download the latest CID and reconstruct the
							repository state locally.
						</p>
					</div>

					{repo.cloneUrl ? (
						<>
							<a
								href={repo.cloneUrl}
								target="_blank"
								rel="noreferrer"
								className="btn-secondary inline-flex w-fit"
							>
								Download Bundle
							</a>
							<CommandBlock
								command={`curl -L ${repo.cloneUrl} -o crrp-${repo.repoId.slice(2, 10)}.bundle
git clone crrp-${repo.repoId.slice(2, 10)}.bundle crrp-${repo.repoId.slice(2, 10)}
cd crrp-${repo.repoId.slice(2, 10)}`}
							/>
						</>
					) : (
						<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-text-secondary">
							No latest CID is available yet, so the web app cannot offer bundle download
							instructions.
						</div>
					)}
				</div>

				<div className="card space-y-4">
					<div>
						<h2 className="section-title">Current User Roles</h2>
						<p className="text-sm text-text-secondary mt-1">
							Roles are read directly from the registry for the active browser or dev
							account.
						</p>
					</div>
					<div className="space-y-2">
						<RoleBadge label="Maintainer" active={repo.roles.isMaintainer} />
						<RoleBadge label="Contributor" active={repo.roles.isContributor} />
						<RoleBadge label="Reviewer" active={repo.roles.isReviewer} />
					</div>
					<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-text-secondary">
						<div>Signed-in account</div>
						<div className="mt-1 font-mono break-all text-text-primary">
							{account || "Using local dev fallback"}
						</div>
					</div>
				</div>
			</section>

			<section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
				<div className="card space-y-4">
					<div>
						<h2 className="section-title">Latest Repository State</h2>
						<p className="text-sm text-text-secondary mt-1">
							Read-only summary of the current canonical state selected by the contract.
						</p>
					</div>
					<div className="space-y-3">
						<StateRow label="HEAD commit" value={repo.latestCommitHash} />
						<StateRow label="HEAD CID" value={repo.latestCid} />
						<StateRow label="Latest merge timestamp" value={formatRepoTimestamp(repo.commitList[0]?.timestamp ?? null)} />
						<StateRow label="Recent canonical commits" value={repo.commitList.length.toString()} />
						<StateRow label="Releases recorded" value={repo.releases.length.toString()} />
					</div>
				</div>

				<div className="card space-y-4">
					<div>
						<h2 className="section-title">Recent History</h2>
						<p className="text-sm text-text-secondary mt-1">
							Initial creation plus merged proposal commits.
						</p>
					</div>
					<div className="space-y-3">
						{repo.commitList.slice(0, 3).map((entry) => (
							<div
								key={`${entry.type}-${entry.commitHash}-${entry.blockNumber?.toString() ?? "na"}`}
								className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3"
							>
								<div className="flex items-center justify-between gap-3">
									<div className="text-sm font-medium text-text-primary">
										{entry.type === "initial" ? "Repository created" : "Merged proposal"}
									</div>
									<div className="text-xs text-text-tertiary">
										{formatRepoTimestamp(entry.timestamp)}
									</div>
								</div>
								<div className="mt-2 text-xs text-text-secondary font-mono">
									{shortenHash(entry.commitHash)}
								</div>
								<div className="mt-1 text-xs text-text-secondary">
									Actor {shortenAddress(entry.actor)}
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			<TreasuryDonationCard
				repoId={repo.repoId}
				treasuryAddress={repo.treasuryAddress}
				balance={repo.treasuryBalance}
				contributionReward={repo.contributionReward}
				reviewReward={repo.reviewReward}
				totalClaimable={repo.totalClaimable}
				unfundedClaimable={repo.unfundedClaimable}
				onDonated={() => window.location.reload()}
			/>
		</div>
	);
}

function ValueCard({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="card">
			<div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{label}</div>
			<div className={`mt-2 text-sm text-text-primary break-all ${mono ? "font-mono" : ""}`}>
				{value}
			</div>
		</div>
	);
}

function StateRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1 border-b border-white/[0.06] pb-3 last:border-b-0 last:pb-0">
			<div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{label}</div>
			<div className="text-sm text-text-primary font-mono break-all">{value || "Unavailable"}</div>
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

function CommandBlock({ command }: { command: string }) {
	return (
		<pre className="rounded-lg border border-white/[0.06] bg-black/20 p-4 text-xs text-text-primary overflow-x-auto">
			<code>{command}</code>
		</pre>
	);
}
