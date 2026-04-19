import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DEFAULT_REPO_NAME, DEFAULT_REPO_ORGANIZATION } from "../config/crrp";
import {
	deriveRepoId,
	formatRepoTimestamp,
	isValidRepoSlugPart,
	normalizeRepoSlugPart,
	shortenAddress,
	shortenHash,
} from "../lib/crrp";
import { useRepoList } from "../features/repo/useRepoList";

export default function HomeRoute() {
	const navigate = useNavigate();
	const { repos, loading, error } = useRepoList();
	const [organizationInput, setOrganizationInput] = useState(DEFAULT_REPO_ORGANIZATION);
	const [repositoryInput, setRepositoryInput] = useState(DEFAULT_REPO_NAME);

	const uniqueRepos = useMemo(
		() => repos.filter((repo, index, all) => all.findIndex((candidate) => candidate.repoId === repo.repoId) === index),
		[repos],
	);

	const openRepository = () => {
		const organization = normalizeRepoSlugPart(organizationInput);
		const repository = normalizeRepoSlugPart(repositoryInput);
		if (!isValidRepoSlugPart(organization) || !isValidRepoSlugPart(repository)) {
			return;
		}
		navigate(`/repo/${encodeURIComponent(organization)}/${encodeURIComponent(repository)}`);
	};

	return (
		<div className="space-y-8">
			<section className="space-y-3">
				<h1 className="page-title">CRRP Repository Registry</h1>
				<p className="text-text-secondary max-w-3xl leading-relaxed">
					Read the canonical repository state from the registry, inspect merged commits,
					check your roles, and fund the incentives treasury. Proposal creation and other
					repo-state write actions stay out of the web MVP for now.
				</p>
			</section>

			<section className="card space-y-4">
				<div>
					<h2 className="section-title">Load Repository</h2>
					<p className="text-sm text-text-secondary mt-1">
						Open a repository with its organization and name. The app derives the on-chain
						`bytes32` id client-side from `org/repo`.
					</p>
				</div>
				<div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
					<input
						type="text"
						value={organizationInput}
						onChange={(event) => setOrganizationInput(event.target.value)}
						placeholder="organization"
						className="input-field"
					/>
					<input
						type="text"
						value={repositoryInput}
						onChange={(event) => setRepositoryInput(event.target.value)}
						placeholder="repository"
						className="input-field"
					/>
					<button
						onClick={openRepository}
						disabled={
							!isValidRepoSlugPart(normalizeRepoSlugPart(organizationInput)) ||
							!isValidRepoSlugPart(normalizeRepoSlugPart(repositoryInput))
						}
						className="btn-primary md:min-w-40"
					>
						Open Repo
					</button>
				</div>
				{isValidRepoSlugPart(normalizeRepoSlugPart(organizationInput)) &&
				isValidRepoSlugPart(normalizeRepoSlugPart(repositoryInput)) ? (
					<div className="text-xs text-text-tertiary font-mono">
						Derived repo id:{" "}
						{deriveRepoId(
							normalizeRepoSlugPart(organizationInput),
							normalizeRepoSlugPart(repositoryInput),
						)}
					</div>
				) : null}
			</section>

			<section className="space-y-4">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h2 className="section-title">Discovered Repositories</h2>
						<p className="text-sm text-text-secondary mt-1">
							Listed from `RepoCreated` events emitted by the registry.
						</p>
					</div>
					<div className="text-xs text-text-tertiary">{uniqueRepos.length} repo(s)</div>
				</div>

				{loading ? <SkeletonList /> : null}
				{error ? <ErrorCard message={error} /> : null}
				{!loading && !error && uniqueRepos.length === 0 ? (
					<div className="card text-sm text-text-secondary">
						No repositories have been discovered on the configured registry yet.
					</div>
				) : null}

				<div className="grid gap-4">
					{uniqueRepos.map((repo) => (
						<Link
							key={repo.repoId}
							to={`/repo/${encodeURIComponent(repo.organization)}/${encodeURIComponent(repo.repository)}`}
							className="card-hover block"
						>
							<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
								<div className="space-y-2">
									<div className="text-sm font-semibold text-text-primary">
										{repo.organization}/{repo.repository}
									</div>
									<div className="text-sm text-text-secondary">
										Maintainer {shortenAddress(repo.maintainer)}
									</div>
									<div className="text-xs text-text-tertiary font-mono">{repo.repoId}</div>
								</div>
								<div className="grid gap-2 text-sm text-text-secondary md:text-right">
									<div>HEAD {shortenHash(repo.headCommit)}</div>
									<div>{repo.headCid || "No CID recorded"}</div>
									<div>{formatRepoTimestamp(repo.createdAt)}</div>
								</div>
							</div>
						</Link>
					))}
				</div>
			</section>
		</div>
	);
}

function SkeletonList() {
	return (
		<div className="grid gap-4">
			{Array.from({ length: 3 }).map((_, index) => (
				<div key={index} className="card animate-pulse">
					<div className="h-4 w-64 rounded bg-white/[0.06]" />
					<div className="mt-3 h-3 w-40 rounded bg-white/[0.04]" />
				</div>
			))}
		</div>
	);
}

function ErrorCard({ message }: { message: string }) {
	return <div className="card text-sm text-accent-red">{message}</div>;
}
