import { useGlobalLeaderboard } from "../features/leaderboard/useLeaderboards";
import {
	LeaderboardSummaryCards,
	LeaderboardTable,
} from "../features/leaderboard/LeaderboardTable";

export default function LeaderboardRoute() {
	const { entries, summary, loading, error } = useGlobalLeaderboard();

	return (
		<div className="space-y-6">
			<section className="space-y-3">
				<h1 className="page-title">Global Leaderboard</h1>
				<p className="text-text-secondary max-w-3xl">
					This leaderboard is derived client-side from treasury reward and claim events.
					It ranks accounts across every discovered repository treasury without storing any
					ranking state on-chain.
				</p>
			</section>

			<LeaderboardSummaryCards summary={summary} />

			<section className="space-y-4">
				<div>
					<h2 className="section-title">Contributors And Reviewers</h2>
					<p className="text-sm text-text-secondary mt-1">
						Contribution and review counts are inferred from reward accruals and proposal
						ownership, not from an external indexer.
					</p>
				</div>

				{loading ? <div className="card animate-pulse h-40" /> : null}
				{error ? <div className="card text-sm text-accent-red">{error}</div> : null}
				{!loading && !error ? (
					<LeaderboardTable
						entries={entries}
						emptyMessage="No treasury rewards have been accrued yet."
					/>
				) : null}
			</section>
		</div>
	);
}
