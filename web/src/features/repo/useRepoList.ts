import { useEffect, useState } from "react";
import { listRepos, type RepoListItem } from "../../lib/aperio";

export function useRepoList() {
	const [repos, setRepos] = useState<RepoListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const run = async () => {
			setLoading(true);
			setError(null);
			try {
				const nextRepos = await listRepos();
				if (!cancelled) {
					setRepos(nextRepos);
				}
			} catch (cause) {
				if (!cancelled) {
					setError(cause instanceof Error ? cause.message : "Failed to load repositories");
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		};

		void run();
		return () => {
			cancelled = true;
		};
	}, []);

	return { repos, loading, error };
}
