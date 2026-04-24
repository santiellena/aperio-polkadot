import { Link } from "react-router-dom";
import { useRepoOverview } from "../features/repo/useRepoOverview";
import { deriveRepoId, shortenHash } from "../lib/aperio";

const commandBlock =
	"min-w-0 rounded-xl border border-white/[0.06] bg-black/25 p-4 font-mono text-[12px] text-text-primary overflow-x-auto whitespace-pre-wrap break-words";
const cliOrganization = "aperio";
const cliRepository = "aperio-cli";

export default function DocsRoute() {
	const aperioRepoId = deriveRepoId(cliOrganization, cliRepository);
	const {
		repo: cliRepo,
		loading: cliRepoLoading,
		error: cliRepoError,
	} = useRepoOverview(cliOrganization, cliRepository);
	const latestBundleUrl = cliRepo?.cloneUrl ?? null;
	const latestCid = cliRepo?.latestCid ?? "";
	const latestBundleFileName = `${cliOrganization}-${cliRepository}.bundle`;
	const repoNotCreatedYet =
		typeof cliRepoError === "string" && cliRepoError.toLowerCase().includes("not found");
	const cliStatusMessage = cliRepoLoading
		? "Looking up the repository on-chain."
		: repoNotCreatedYet
			? "The repository has not been created on-chain yet. Once `aperio/aperio-cli` is registered and a HEAD CID exists, this section will resolve its latest bundle automatically."
			: cliRepoError
				? cliRepoError
				: latestBundleUrl
					? `Resolved bundle URL from the current HEAD CID (${shortenHash(aperioRepoId, 6)}).`
					: "The repository exists but there is no downloadable HEAD bundle yet.";

	return (
		<div className="space-y-6">
			<section className="hero-card p-6 md:p-7">
				<div className="relative z-10 space-y-4">
					<div className="eyebrow">Docs</div>
					<div className="max-w-4xl space-y-3">
						<h1 className="page-title">How To Use The Aperio Frontend</h1>
						<p className="max-w-3xl text-sm leading-7 text-text-secondary md:text-[15px]">
							Aperio is a censorship-resistant repository registry. Git remains the
							source of code and history, Bulletin stores bundles, and the contract
							records which commit is canonical. The frontend helps you connect
							wallets, create repositories, submit proposals, review them, and inspect
							the registry state.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Link to="/" className="btn-primary">
							Open Repositories
						</Link>
						<Link to="/config" className="btn-secondary">
							Open Config
						</Link>
					</div>
				</div>
			</section>

			<section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
				<div className="card space-y-4">
					<div>
						<div className="eyebrow">Mental Model</div>
						<h2 className="section-title mt-2">What The Frontend Is Actually Doing</h2>
					</div>
					<div className="grid gap-3 md:grid-cols-4">
						<div className="card-muted">
							<div className="panel-label">1. Git</div>
							<div className="metric-value mt-1 text-base">Build state</div>
							<p className="mt-2 text-sm text-text-secondary">
								You prepare the repository and choose the commit you want Aperio to
								point to.
							</p>
						</div>
						<div className="card-muted">
							<div className="panel-label">2. Bundle</div>
							<div className="metric-value mt-1 text-base">Package state</div>
							<p className="mt-2 text-sm text-text-secondary">
								You upload a Git bundle or provide an existing CID for one that
								already exists in Bulletin.
							</p>
						</div>
						<div className="card-muted">
							<div className="panel-label">3. Contract</div>
							<div className="metric-value mt-1 text-base">Select truth</div>
							<p className="mt-2 text-sm text-text-secondary">
								The registry stores the repository slug, the commit hash, and the
								bundle pointer. It does not store your code.
							</p>
						</div>
						<div className="card-muted">
							<div className="panel-label">4. Review</div>
							<div className="metric-value mt-1 text-base">Approve or reject</div>
							<p className="mt-2 text-sm text-text-secondary">
								Reviewers inspect off-chain and only record a decision on-chain.
								Maintainers resolve merges in Git, not in the contract.
							</p>
						</div>
					</div>
				</div>

				<div className="card space-y-4">
					<div>
						<div className="eyebrow">Rules</div>
						<h2 className="section-title mt-2">The Commit Rules</h2>
					</div>
					<ul className="space-y-2 text-sm leading-6 text-text-secondary">
						<li>Use `main` only. Aperio is single-branch.</li>
						<li>Always enter the full 40-character commit hash.</li>
						<li>The commit you enter must exist inside the bundle you upload.</li>
						<li>HEAD means the canonical commit selected by the registry.</li>
						<li>Merges happen locally in Git. The contract only records the result.</li>
					</ul>
					<div className="card-muted">
						<div className="panel-label">Quick Reminder</div>
						<p className="mt-2 text-sm text-text-secondary">
							If you are copying a hash from `git log --oneline`, do not use the short
							hash. Resolve it to the full commit first.
						</p>
						<pre className={commandBlock}>
							<code>{`git rev-parse HEAD
git rev-parse <short-hash>`}</code>
						</pre>
					</div>
				</div>
			</section>

			<section className="card space-y-5">
				<div>
					<div className="eyebrow">Workflow</div>
					<h2 className="section-title mt-2">Frontend Flow</h2>
				</div>

				<div className="grid gap-4 lg:grid-cols-3">
					<div className="card-muted space-y-3">
						<div className="panel-label">Set Up</div>
						<p className="text-sm text-text-secondary">
							Auth with your `pwallet` by scanning the QR.
						</p>
					</div>
					<div className="card-muted space-y-3">
						<div className="panel-label">Create Repository</div>
						<p className="text-sm text-text-secondary">
							Use{" "}
							<Link to="/create" className="text-polka-400 hover:text-polka-300">
								Create Repository
							</Link>{" "}
							to register the slug, initial HEAD, bundle CID, and optional
							treasury/reviewer settings.
						</p>
					</div>
					<div className="card-muted space-y-3">
						<div className="panel-label">Propose And Review</div>
						<p className="text-sm text-text-secondary">
							From a repository page, submit proposals against the current HEAD, then
							let reviewers inspect the bundle and record approvals or rejections.
						</p>
					</div>
				</div>
			</section>

			<section className="grid gap-4 xl:grid-cols-2">
				<div className="card space-y-4">
					<div>
						<div className="eyebrow">Commits</div>
						<h2 className="section-title mt-2">Which Commit Hash To Use</h2>
					</div>
					<div className="space-y-4 text-sm leading-7 text-text-secondary">
						<div className="card-muted">
							<div className="panel-label">
								Create Repository → Initial HEAD Commit
							</div>
							<p className="mt-2">
								Use the exact commit that should become the repository&apos;s first
								canonical HEAD. In practice, this is the tip commit of the bundle
								you are uploading for initial registration.
							</p>
						</div>
						<div className="card-muted">
							<div className="panel-label">Submit Proposal → Proposed Commit</div>
							<p className="mt-2">
								Use the exact candidate commit that the proposal asks reviewers to
								accept. That commit must be present in the proposal bundle CID.
							</p>
						</div>
						<div className="card-muted">
							<div className="panel-label">Review Proposal</div>
							<p className="mt-2">
								Reviewers do not invent a new commit. They verify that the
								proposal&apos;s declared commit matches the bundle contents and then
								approve or reject.
							</p>
						</div>
						<div className="card-muted">
							<div className="panel-label">Merge Result</div>
							<p className="mt-2">
								If a maintainer merges locally and conflict resolution creates a new
								commit, that new merge-result commit is the one that should become
								canonical, not the original proposed commit.
							</p>
						</div>
					</div>
				</div>

				<div className="card space-y-4">
					<div>
						<div className="eyebrow">Git</div>
						<h2 className="section-title mt-2">Recommended Commands</h2>
					</div>
					<div className="space-y-4">
						<div>
							<div className="panel-label mb-2">
								Inspect The Commit You Want To Register
							</div>
							<pre className={commandBlock}>
								<code>{`git checkout main
git status
git rev-parse HEAD
git log --decorate --oneline -n 5`}</code>
							</pre>
						</div>
						<div>
							<div className="panel-label mb-2">
								Create A Bundle For The Current Main State
							</div>
							<pre className={commandBlock}>
								<code>{`git checkout main
git bundle create aperio.bundle main`}</code>
							</pre>
						</div>
						<div>
							<div className="panel-label mb-2">
								Verify A Bundle Before Using Its CID
							</div>
							<pre className={commandBlock}>
								<code>{`git bundle verify aperio.bundle
git rev-list --max-count=1 main`}</code>
							</pre>
						</div>
					</div>
					<div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-text-secondary">
						The bundle file and the commit hash must describe the same Git state. If
						those two do not match, the registry entry is wrong even if the transaction
						succeeds.
					</div>
				</div>
			</section>

			<section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
				<div className="card min-w-0 space-y-4">
					<div>
						<div className="eyebrow">CLI</div>
						<h2 className="section-title mt-2">Using The Aperio CLI</h2>
					</div>
					<div className="space-y-3 text-sm leading-7 text-text-secondary">
						<p>
							The Aperio CLI is the terminal companion to the web app. It is meant for
							people who want a faster and more scriptable workflow than clicking
							through the UI for every repository action.
						</p>
						<p>
							It improves developer experience in two main ways: first, it lets you
							run the full Aperio flow from the command line; second, it makes
							repeatable operations easier when you want to automate repository
							creation, proposal submission, reviews, merges, or bundle downloads.
						</p>
					</div>
					<div className="grid gap-3 md:grid-cols-1">
						<div className="card-muted">
							<pre className={`${commandBlock} mt-2`}>
								<code>{`# After cloning or unpacking aperio-cli
npm install
npm link

# Set up
aperio import "<suri>"
aperio map

# Use it
aperio download aperio aperio-cli --out ./aperio-cli
`}</code>
							</pre>
						</div>
					</div>
					<div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-sm text-text-secondary">
						Use the curl command in the panel on the right to fetch the latest bundle
						for `aperio/aperio-cli` when it is available on-chain. Inside the standalone
						CLI repository, the main operator guide is simply `README.md`.
					</div>
				</div>

				<div className="card min-w-0 space-y-4">
					<div>
						<div className="eyebrow">Bundle Fetch</div>
						<h2 className="section-title mt-2">
							Latest Bundle For `aperio/aperio-cli`
						</h2>
					</div>
					<div className="card-muted space-y-3">
						<div>
							<div className="panel-label">Derived Repo ID</div>
							<div className="mt-1 break-all font-mono text-sm text-text-primary">
								{aperioRepoId}
							</div>
						</div>
						<div>
							<div className="panel-label">Latest HEAD CID</div>
							<div className="mt-1 break-all font-mono text-sm text-text-primary">
								{cliRepoLoading
									? "Loading current repository state..."
									: latestCid || "No CID recorded yet"}
							</div>
						</div>
						<div>
							<div className="panel-label">Status</div>
							<p className="mt-1 text-sm text-text-secondary">{cliStatusMessage}</p>
						</div>
						{latestBundleUrl ? (
							<pre className={commandBlock}>
								<code>{`curl -L "${latestBundleUrl}" -o ${latestBundleFileName}`}</code>
							</pre>
						) : (
							<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-text-secondary">
								{repoNotCreatedYet
									? "Repo Not Created Yet"
									: "Download Unavailable"}
							</div>
						)}
					</div>
					<div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-text-secondary">
						This section derives the repo id from `aperio/aperio-cli`, looks up the
						current repository overview, reads the latest HEAD CID, and resolves the
						bundle gateway URL from that CID.
					</div>
				</div>
			</section>

			<section className="card space-y-4">
				<div>
					<div className="eyebrow">Using The UI</div>
					<h2 className="section-title mt-2">What Each Main Page Is For</h2>
				</div>
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					<div className="card-muted">
						<div className="panel-label">Repositories</div>
						<p className="mt-2 text-sm text-text-secondary">
							Browse the registry, inspect repository status, open proposal lists, and
							jump into creation or proposal submission.
						</p>
					</div>
					<div className="card-muted">
						<div className="panel-label">Repository Detail</div>
						<p className="mt-2 text-sm text-text-secondary">
							See canonical HEAD, bundle CID, maintainer/reviewer state, treasury
							stats, and repo-specific leaderboard information.
						</p>
					</div>
					<div className="card-muted">
						<div className="panel-label">Leaderboard</div>
						<p className="mt-2 text-sm text-text-secondary">
							View contributor earnings and activity derived from on-chain treasury
							and claim events.
						</p>
					</div>
					<div className="card-muted">
						<div className="panel-label">Config</div>
						<p className="mt-2 text-sm text-text-secondary">
							Set endpoints, connect wallets, confirm host/browser availability, and
							verify the account path you will use for transactions.
						</p>
					</div>
				</div>
			</section>

			<section className="card space-y-4">
				<div>
					<div className="eyebrow">Notes</div>
					<h2 className="section-title mt-2">
						Known Limitations, Future Features, And Nice-To-Haves
					</h2>
				</div>
				<div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
					<ul className="space-y-3 text-sm leading-7 text-text-secondary">
						<li>
							- There could be a slashing mechanism for the maintainer to slash
							reviewers who are not behaving appropriately.
						</li>
						<li>
							- If spam becomes a problem, a fee to submit a proposal could be added
							and then released once the proposal gets merged.
						</li>
						<li>
							- Restricting an organization name to a single address is not currently
							implemented because the goal is to allow multiple maintainers to operate
							under the same organization. Governance systems are a natural fit here.
						</li>
						<li>
							- The maintainer is limited to a user address in the current demo and
							MVP, but the intended direction is to let a DAO control the maintainer
							role so stakeholders of the repository take those decisions
							collectively.
						</li>
						<li>
							- The treasury pays contributors and reviewers, but that is not its only
							possible use. Those funds could also be used to refresh the latest CID
							on the Bulletin chain and support other governance-approved actions.
						</li>
						<li>
							- The protocol already tracks releases, but a stronger end-user release
							download experience would still be valuable, especially for cases where
							releases point to compressed binaries or other packaged deliverables.
						</li>
						<li>
							- The current architecture limits very large repositories because
							Bulletin has a maximum amount of data that can be submitted in a
							practical way for this MVP.
						</li>
						<li>
							- The Statement Store is not used in the MVP, but it could become the
							basis for a chat or coordination layer between maintainers, reviewers,
							and contributors when code alone is not enough to explain intent or
							feedback.
						</li>
					</ul>
				</div>
			</section>
		</div>
	);
}
