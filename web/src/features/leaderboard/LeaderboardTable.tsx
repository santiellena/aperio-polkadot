import {
	formatEthAmount,
	formatRepoTimestamp,
	type LeaderboardEntry,
	type LeaderboardSummary,
} from "../../lib/crrp";

export function LeaderboardSummaryCards({ summary }: { summary: LeaderboardSummary }) {
	return (
		<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
			<SummaryCard label="Total Earned" value={formatEthAmount(summary.totalEarned)} />
			<SummaryCard label="Total Claimed" value={formatEthAmount(summary.totalClaimed)} />
			<SummaryCard label="Total Unclaimed" value={formatEthAmount(summary.totalUnclaimed)} />
			<SummaryCard label="Accounts Ranked" value={summary.contributorCount.toString()} />
		</div>
	);
}

export function LeaderboardTable({
	entries,
	emptyMessage,
	showRepoBreakdown = true,
}: {
	entries: LeaderboardEntry[];
	emptyMessage: string;
	showRepoBreakdown?: boolean;
}) {
	if (entries.length === 0) {
		return <div className="card text-sm text-text-secondary">{emptyMessage}</div>;
	}

	return (
		<div className="space-y-3">
			{entries.map((entry) => (
				<div key={entry.account} className="card space-y-4">
					<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
						<div>
							<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
								Rank #{entry.rank}
							</div>
							<div className="mt-2 text-sm font-semibold text-text-primary">
								{entry.displayName}
							</div>
							<div className="mt-1 text-xs font-mono text-text-secondary break-all">
								{entry.account}
							</div>
						</div>
						<div className="grid gap-1 text-sm text-text-secondary md:text-right">
							<div>Earned {formatEthAmount(entry.totalEarned)}</div>
							<div>Claimed {formatEthAmount(entry.totalClaimed)}</div>
							<div>Unclaimed {formatEthAmount(entry.unclaimed)}</div>
						</div>
					</div>

					<div className="grid gap-3 md:grid-cols-4">
						<Stat label="Contributions" value={entry.contributionCount.toString()} />
						<Stat label="Reviews" value={entry.reviewCount.toString()} />
						<Stat label="Repos" value={entry.repoCount.toString()} />
						<Stat
							label="Last Activity"
							value={
								entry.lastActivityAt
									? formatRepoTimestamp(entry.lastActivityAt)
									: "No rewards yet"
							}
						/>
					</div>

					{showRepoBreakdown && entry.repos.length > 0 ? (
						<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
							<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
								Top Repositories
							</div>
							<div className="mt-3 grid gap-2">
								{entry.repos.slice(0, 3).map((repo) => (
									<div
										key={`${entry.account}-${repo.repoId}`}
										className="flex flex-col gap-1 text-sm text-text-secondary md:flex-row md:items-center md:justify-between"
									>
										<div>
											{repo.organization}/{repo.repository}
										</div>
										<div className="font-mono">
											{formatEthAmount(repo.earned)} earned, {formatEthAmount(repo.claimed)} claimed
										</div>
									</div>
								))}
							</div>
						</div>
					) : null}
				</div>
			))}
		</div>
	);
}

function SummaryCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="card">
			<div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{label}</div>
			<div className="mt-2 text-sm text-text-primary font-mono break-all">{value}</div>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
			<div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{label}</div>
			<div className="mt-1 text-sm text-text-primary">{value}</div>
		</div>
	);
}
