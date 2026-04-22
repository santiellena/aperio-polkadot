import { useCallback, useEffect, useState } from "react";
import {
	isValidRepoSlugPart,
	normalizeRepoSlugPart,
	readRepoOverview,
	type RepoOverview,
} from "../../lib/aperio";
import type { Address } from "viem";

export function useRepoOverview(
	organization: string | undefined,
	repository: string | undefined,
	account?: Address | null,
) {
	const [repo, setRepo] = useState<RepoOverview | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

	useEffect(() => {
		let cancelled = false;

		const run = async () => {
			const normalizedOrganization = normalizeRepoSlugPart(organization ?? "");
			const normalizedRepository = normalizeRepoSlugPart(repository ?? "");
			if (
				!isValidRepoSlugPart(normalizedOrganization) ||
				!isValidRepoSlugPart(normalizedRepository)
			) {
				setRepo(null);
				setError("Repository path must include organization and repository name");
				setLoading(false);
				return;
			}

			setLoading(true);
			setError(null);
			try {
				const nextRepo = await readRepoOverview(
					normalizedOrganization,
					normalizedRepository,
					account ?? undefined,
				);
				if (!cancelled) {
					setRepo(nextRepo);
				}
			} catch (cause) {
				if (!cancelled) {
					setRepo(null);
					setError(cause instanceof Error ? cause.message : "Failed to load repository");
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
	}, [account, organization, repository, refreshKey]);

	return { repo, loading, error, refresh };
}
