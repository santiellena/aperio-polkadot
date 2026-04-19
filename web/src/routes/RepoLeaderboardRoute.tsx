import { Link, useParams } from "react-router-dom";
import { LeaderboardSummaryCards, LeaderboardTable } from "../features/leaderboard/LeaderboardTable";
import { useRepoLeaderboard } from "../features/leaderboard/useLeaderboards";
import { useWalletSession } from "../features/auth/useWalletSession";
import { useRepoOverview } from "../features/repo/useRepoOverview";

export default function RepoLeaderboardRoute() {
	const { organization, repository } = useParams();
	const { account } = useWalletSession();
	const { repo, loading: repoLoading, error: repoError } = useRepoOverview(
		organization,
		repository,
		account,
	);
	const {
		entries,
		summary,
		loading: leaderboardLoading,
		error: leaderboardError,
	} = useRepoLeaderboard(repo?.repoId, repo?.organization, repo?.repository, repo?.treasuryAddress);

	if (repoLoading) {
		return <div className="card animate-pulse h-40" />;
	}

	if (repoError || !repo) {
		return (
			<div className="card">
				<h1 className="section-title">Leaderboard Unavailable</h1>
				<p className="mt-3 text-sm text-accent-red">{repoError || "Repository not found"}</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<section className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div>
					<h1 className="page-title">Repository Leaderboard</h1>
					<p className="mt-2 text-text-secondary">
						{repo.organization}/{repo.repository}
					</p>
					<p className="mt-1 text-text-tertiary font-mono break-all">{repo.repoId}</p>
				</div>
				<Link
					to={`/repo/${encodeURIComponent(repo.organization)}/${encodeURIComponent(repo.repository)}`}
					className="btn-secondary"
				>
					Back To Overview
				</Link>
			</section>

			<LeaderboardSummaryCards summary={summary} />

			<section className="space-y-4">
				<div>
					<h2 className="section-title">Rankings For This Repository</h2>
					<p className="text-sm text-text-secondary mt-1">
						Only rewards and claims for this repository treasury are included.
					</p>
				</div>

				{leaderboardLoading ? <div className="card animate-pulse h-40" /> : null}
				{leaderboardError ? (
					<div className="card text-sm text-accent-red">{leaderboardError}</div>
				) : null}
				{!leaderboardLoading && !leaderboardError ? (
					<LeaderboardTable
						entries={entries}
						emptyMessage="No rewards have been accrued for this repository yet."
						showRepoBreakdown={false}
					/>
				) : null}
			</section>
		</div>
	);
}
