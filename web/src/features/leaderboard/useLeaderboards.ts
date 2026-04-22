import { useEffect, useState } from "react";
import {
	readGlobalLeaderboard,
	readRepoLeaderboard,
	type LeaderboardEntry,
	type LeaderboardSummary,
} from "../../lib/aperio";
import type { Address, Hex } from "viem";

type LeaderboardState = {
	entries: LeaderboardEntry[];
	summary: LeaderboardSummary;
	loading: boolean;
	error: string | null;
};

const EMPTY_SUMMARY: LeaderboardSummary = {
	totalEarned: 0n,
	totalClaimed: 0n,
	totalUnclaimed: 0n,
	contributorCount: 0,
};

export function useGlobalLeaderboard() {
	const [state, setState] = useState<LeaderboardState>({
		entries: [],
		summary: EMPTY_SUMMARY,
		loading: true,
		error: null,
	});

	useEffect(() => {
		let cancelled = false;

		const run = async () => {
			setState((current) => ({ ...current, loading: true, error: null }));
			try {
				const result = await readGlobalLeaderboard();
				if (!cancelled) {
					setState({ ...result, loading: false, error: null });
				}
			} catch (cause) {
				if (!cancelled) {
					setState({
						entries: [],
						summary: EMPTY_SUMMARY,
						loading: false,
						error:
							cause instanceof Error ? cause.message : "Failed to load global leaderboard",
					});
				}
			}
		};

		void run();
		return () => {
			cancelled = true;
		};
	}, []);

	return state;
}

export function useRepoLeaderboard(
	repoId: Hex | undefined,
	organization: string | undefined,
	repository: string | undefined,
	treasuryAddress: Address | null | undefined,
) {
	const [state, setState] = useState<LeaderboardState>({
		entries: [],
		summary: EMPTY_SUMMARY,
		loading: true,
		error: null,
	});

	useEffect(() => {
		let cancelled = false;

		const run = async () => {
			if (!repoId || !organization || !repository) {
				setState({
					entries: [],
					summary: EMPTY_SUMMARY,
					loading: false,
					error: "Repository context is incomplete",
				});
				return;
			}

			setState((current) => ({ ...current, loading: true, error: null }));
			try {
				const result = await readRepoLeaderboard(repoId, organization, repository, treasuryAddress ?? null);
				if (!cancelled) {
					setState({ ...result, loading: false, error: null });
				}
			} catch (cause) {
				if (!cancelled) {
					setState({
						entries: [],
						summary: EMPTY_SUMMARY,
						loading: false,
						error: cause instanceof Error ? cause.message : "Failed to load repo leaderboard",
					});
				}
			}
		};

		void run();
		return () => {
			cancelled = true;
		};
	}, [organization, repoId, repository, treasuryAddress]);

	return state;
}
