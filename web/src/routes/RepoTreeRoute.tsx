import { Link, useParams } from "react-router-dom";
import { useWalletSession } from "../features/auth/useWalletSession";
import { useRepoOverview } from "../features/repo/useRepoOverview";

export default function RepoTreeRoute() {
	const { organization, repository } = useParams();
	const { account } = useWalletSession();
	const { repo, loading, error } = useRepoOverview(organization, repository, account);

	if (loading) {
		return <div className="card animate-pulse h-40" />;
	}

	if (error || !repo) {
		return (
			<div className="card">
				<h1 className="section-title">Tree Unavailable</h1>
				<p className="mt-3 text-sm text-accent-red">{error || "Repository not found"}</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<section className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div>
					<h1 className="page-title">Repository Tree</h1>
					<p className="mt-2 text-text-secondary max-w-3xl">
						The current frontend MVP does not ship a browser-side Git bundle reader yet.
						This route exists so the app structure matches the CRRP read model, but file
						tree navigation still depends on fetching and decoding bundle contents from the
						recorded CID.
					</p>
				</div>
				<Link
					to={`/repo/${encodeURIComponent(repo.organization)}/${encodeURIComponent(repo.repository)}`}
					className="btn-secondary"
				>
					Back To Overview
				</Link>
			</section>

			<div className="card space-y-4">
				<div>
					<h2 className="section-title">Next Source Of Truth</h2>
					<p className="mt-1 text-sm text-text-secondary">
						When a bundle parser is added, this page should read the artifact referenced by
						the latest CID and render the repository tree without introducing any server-side
						indexer.
					</p>
				</div>
				<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4 text-sm text-text-secondary break-all">
					Latest CID: {repo.latestCid || "Not recorded"}
				</div>
				{repo.cloneUrl ? (
					<a href={repo.cloneUrl} target="_blank" rel="noreferrer" className="btn-secondary inline-flex w-fit">
						Open Bundle Artifact
					</a>
				) : null}
			</div>
		</div>
	);
}
