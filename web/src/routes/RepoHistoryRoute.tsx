import { Link, useParams } from "react-router-dom";
import { keccak256 } from "viem";
import { useSubstrateSession } from "../features/auth/useSubstrateSession";
import { useWalletSession } from "../features/auth/useWalletSession";
import { useRepoOverview } from "../features/repo/useRepoOverview";
import { formatGitCommitHash, formatRepoTimestamp, shortenAddress, shortenHash } from "../lib/aperio";

export default function RepoHistoryRoute() {
	const { organization, repository } = useParams();
	const { account } = useWalletSession();
	const { browserAccounts, selectedBrowserAccountIndex } = useSubstrateSession();
	const substrateAccount = browserAccounts[selectedBrowserAccountIndex] ?? null;
	const substrateH160 = substrateAccount
		? (`0x${keccak256(substrateAccount.polkadotSigner.publicKey).slice(-40)}` as `0x${string}`)
		: null;
	const effectiveAccount = substrateH160 ?? account;
	const { repo, loading, error } = useRepoOverview(organization, repository, effectiveAccount);

	if (loading) {
		return <div className="card animate-pulse h-40" />;
	}

	if (error || !repo) {
		return (
			<div className="card">
				<h1 className="section-title">History Unavailable</h1>
				<p className="mt-3 text-sm text-accent-red">{error || "Repository not found"}</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<section className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div>
					<h1 className="page-title">Commit History</h1>
					<p className="mt-2 text-text-secondary max-w-3xl">
						Canonical history is derived from `RepoCreated` and `ProposalMerged` events.
						That means the page reflects what the contract accepted as repository truth, not
						every off-chain Git action.
					</p>
				</div>
				<Link
					to={`/repo/${encodeURIComponent(repo.organization)}/${encodeURIComponent(repo.repository)}`}
					className="btn-secondary"
				>
					Back To Overview
				</Link>
			</section>

			<section className="card space-y-4">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h2 className="section-title">Canonical Commits</h2>
						<p className="text-sm text-text-secondary mt-1">
							Authors are inferred from on-chain actors: maintainer for initial state,
							contributor for merged proposals.
						</p>
					</div>
					<div className="text-sm text-text-tertiary">{repo.commitList.length} entry(s)</div>
				</div>

				<div className="space-y-3">
					{repo.commitList.map((entry) => (
						<div
							key={`${entry.type}-${entry.commitHash}-${entry.blockNumber?.toString() ?? "na"}`}
							className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4"
						>
							<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
								<div className="space-y-2">
									<div className="text-sm font-semibold text-text-primary">
										{entry.type === "initial" ? "Initial HEAD" : "Merged Proposal"}
									</div>
									<div className="text-sm text-text-secondary font-mono">
										{formatGitCommitHash(entry.commitHash)}
									</div>
									<div className="text-sm text-text-secondary break-all">
										Bundle CID {entry.cid || "Not recorded"}
									</div>
								</div>
								<div className="grid gap-2 text-sm text-text-secondary md:text-right">
									<div>Actor {shortenAddress(entry.actor)}</div>
									<div>{formatRepoTimestamp(entry.timestamp)}</div>
									<div>
										{entry.proposalId === null
											? "Repo creation"
											: `Proposal #${entry.proposalId.toString()}`}
									</div>
									<div>{shortenHash(formatGitCommitHash(entry.commitHash))}</div>
								</div>
							</div>
						</div>
					))}
				</div>
			</section>

			<section className="card space-y-4">
				<div>
					<h2 className="section-title">Releases</h2>
					<p className="text-sm text-text-secondary mt-1">
						Releases point to accepted canonical commits and do not move `HEAD`.
					</p>
				</div>
				{repo.releases.length === 0 ? (
					<div className="text-sm text-text-secondary">
						No releases have been recorded for this repository.
					</div>
				) : (
					<div className="space-y-3">
						{repo.releases.map((release) => (
							<div
								key={`${release.version}-${release.commitHash}`}
								className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4"
							>
								<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
									<div className="text-sm font-semibold text-text-primary">
										{release.version}
									</div>
									<div className="text-xs text-text-tertiary">
										{formatRepoTimestamp(release.timestamp)}
									</div>
								</div>
								<div className="mt-2 text-sm text-text-secondary font-mono break-all">
									{formatGitCommitHash(release.commitHash)}
								</div>
								<div className="mt-1 text-sm text-text-secondary break-all">
									{release.cid}
								</div>
							</div>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
