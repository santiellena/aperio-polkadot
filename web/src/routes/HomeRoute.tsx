import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DEFAULT_REPO_NAME, DEFAULT_REPO_ORGANIZATION } from "../config/crrp";
import {
	deriveRepoId,
	formatEthAmount,
	formatGitCommitHash,
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
			<section className="hero-card">
				<div className="relative z-10 grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
					<div className="space-y-5">
						<div className="eyebrow">Registry Surface</div>
						<div>
							<h1 className="page-title">Read canonical repository state, not just project metadata.</h1>
							<p className="mt-3 max-w-3xl leading-relaxed text-text-secondary">
								CRRP is a repository registry. Git manages history off-chain, Bulletin stores
								bundles, and the contract records which commit is canonical. The web app
								should foreground that sequence.
							</p>
						</div>
						<div className="flex flex-wrap gap-3">
							<Link to="/create" className="btn-primary">
								Create Repository
							</Link>
						</div>
						<div className="grid gap-3 md:grid-cols-3">
							<WorkflowCard
								label="Canonical Truth"
								value={`${uniqueRepos.length}`}
								description="Repositories discovered from on-chain events."
							/>
							<WorkflowCard
								label="Artifact Model"
								value="Git bundles"
								description="The contract stores pointers. Bundles reconstruct repository state."
							/>
							<WorkflowCard
								label="Decision Layer"
								value="HEAD, proposals, releases"
								description="On-chain state records the selected result, not the merge logic."
							/>
						</div>
					</div>
					<div className="card space-y-4">
						<div>
							<div className="eyebrow">Workflow</div>
							<h2 className="section-title mt-2">Canonical flow</h2>
						</div>
						<div className="space-y-3">
							<FlowStep
								step="1"
								title="Repository created"
								description="A maintainer records the initial HEAD commit and bundle CID."
							/>
							<FlowStep
								step="2"
								title="Proposal reviewed"
								description="Contributors submit bundles. Reviewers inspect code off-chain and record a decision."
							/>
							<FlowStep
								step="3"
								title="Final result selected"
								description="Maintainers merge in Git and only the final canonical commit lands on-chain."
							/>
						</div>
					</div>
				</div>
			</section>

			<section className="grid gap-4 lg:grid-cols-[1.1fr_1.4fr]">
				<div className="card space-y-4">
					<div>
						<div className="eyebrow">Lookup</div>
						<h2 className="section-title mt-2">Open repository by slug</h2>
						<p className="mt-1 text-sm text-text-secondary">
							Enter `organization/repository`. The app derives the on-chain `bytes32` repo id
							client-side and opens the canonical state view.
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
						<div className="data-stack">
							<div className="panel-label">Derived repo id</div>
							<div className="mt-2 break-all font-mono text-sm text-text-primary">
								{deriveRepoId(
									normalizeRepoSlugPart(organizationInput),
									normalizeRepoSlugPart(repositoryInput),
								)}
							</div>
						</div>
					) : null}
				</div>
				<div className="card space-y-4">
					<div>
						<div className="eyebrow">Reading guide</div>
						<h2 className="section-title mt-2">What matters on this surface</h2>
					</div>
					<div className="grid gap-3 md:grid-cols-3">
						<SignalCard
							label="HEAD"
							description="The canonical commit currently selected by the contract."
						/>
						<SignalCard
							label="CID"
							description="Pointer to the artifact bytes stored off-chain."
						/>
						<SignalCard
							label="Roles"
							description="Who can propose, review, merge, and claim rewards."
						/>
					</div>
				</div>
			</section>

			<section className="space-y-4">
				<div className="flex items-center justify-between gap-4">
					<div>
						<div className="eyebrow">Registry index</div>
						<h2 className="section-title mt-2">Discovered repositories</h2>
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
							<div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
								<div className="space-y-3">
									<div className="flex flex-wrap items-center gap-2">
										<span className="status-chip border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
											Canonical HEAD set
										</span>
										{repo.headCid ? (
											<span className="status-chip border-blue-500/20 bg-blue-500/10 text-blue-200">
												Bundle linked
											</span>
										) : (
											<span className="status-chip border-white/[0.08] bg-white/[0.04] text-text-secondary">
												No CID
											</span>
										)}
									</div>
									<div className="text-lg font-semibold text-text-primary">
										{repo.organization}/{repo.repository}
									</div>
									<div className="grid gap-2 md:grid-cols-2">
										<div className="card-muted">
											<div className="panel-label">Maintainer</div>
											<div className="mt-2 text-sm text-text-primary">
												{shortenAddress(repo.maintainer)}
											</div>
										</div>
										<div className="card-muted">
											<div className="panel-label">Repo id</div>
											<div className="mt-2 break-all font-mono text-xs text-text-secondary">
												{repo.repoId}
											</div>
										</div>
										<div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
											<div className="panel-label">Rewards earned</div>
											<div className="mt-2 text-base font-semibold text-emerald-200">
												{formatEthAmount(repo.totalEarned)}
											</div>
											<div className="mt-1 text-xs text-emerald-300/80">
												Visible payout history for contributors and reviewers.
											</div>
										</div>
										<div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
											<div className="panel-label">Treasury balance</div>
											<div className="mt-2 text-base font-semibold text-amber-200">
												{formatEthAmount(repo.treasuryBalance)}
											</div>
											<div className="mt-1 text-xs text-amber-300/80">
												Available funding currently sitting in the repo treasury.
											</div>
										</div>
									</div>
								</div>
								<div className="grid gap-3 text-sm text-text-secondary lg:min-w-[320px]">
									<RegistryMetric
										label="HEAD commit"
										value={shortenHash(formatGitCommitHash(repo.headCommit))}
									/>
									<RegistryMetric
										label="Artifact CID"
										value={repo.headCid || "No CID recorded"}
										mono
									/>
									<RegistryMetric
										label="Created"
										value={formatRepoTimestamp(repo.createdAt)}
									/>
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
					<div className="h-4 w-28 rounded bg-white/[0.06]" />
					<div className="mt-4 h-5 w-64 rounded bg-white/[0.08]" />
					<div className="mt-4 h-20 rounded-xl bg-white/[0.04]" />
				</div>
			))}
		</div>
	);
}

function ErrorCard({ message }: { message: string }) {
	return <div className="card text-sm text-accent-red">{message}</div>;
}

function WorkflowCard({
	label,
	value,
	description,
}: {
	label: string;
	value: string;
	description: string;
}) {
	return (
		<div className="card-muted">
			<div className="panel-label">{label}</div>
			<div className="metric-value">{value}</div>
			<div className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</div>
		</div>
	);
}

function FlowStep({
	step,
	title,
	description,
}: {
	step: string;
	title: string;
	description: string;
}) {
	return (
		<div className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
			<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10 text-sm font-semibold text-blue-200">
				{step}
			</div>
			<div>
				<div className="text-sm font-semibold text-text-primary">{title}</div>
				<div className="mt-1 text-sm leading-relaxed text-text-secondary">{description}</div>
			</div>
		</div>
	);
}

function SignalCard({ label, description }: { label: string; description: string }) {
	return (
		<div className="card-muted">
			<div className="text-sm font-semibold text-text-primary">{label}</div>
			<div className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</div>
		</div>
	);
}

function RegistryMetric({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="card-muted">
			<div className="panel-label">{label}</div>
			<div className={`mt-2 break-all text-sm text-text-primary ${mono ? "font-mono" : ""}`}>
				{value}
			</div>
		</div>
	);
}
