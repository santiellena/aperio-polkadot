use clap::{Args, ValueEnum};

#[derive(clap::Subcommand)]
pub enum CrrpAction {
	/// Create/register a repository in the on-chain CRRP registry.
	CreateRepo(CreateRepoArgs),
	/// Prepare and submit a repository proposal (skeleton).
	Propose(ProposeArgs),
	/// Fetch a proposal bundle (skeleton).
	Fetch(FetchArgs),
	/// Submit an approve/reject review for a proposal (skeleton).
	Review(ReviewArgs),
	/// Merge a proposal and submit canonical HEAD (skeleton).
	Merge(MergeArgs),
	/// Create a release from canonical HEAD (skeleton).
	Release(ReleaseArgs),
	/// Show local repo status relevant to CRRP (skeleton).
	Status(StatusArgs),
	/// Show repo-level CRRP metadata (skeleton).
	Repo(RepoArgs),
	/// List proposals for the current repository (skeleton).
	Proposals(ProposalsArgs),
}

#[derive(Args)]
pub struct CreateRepoArgs {
	#[command(flatten)]
	pub common: CrrpCommonArgs,
	/// Initial canonical commit (Git rev; defaults to HEAD).
	#[arg(long)]
	pub initial_commit: Option<String>,
	/// Initial CID pointer for canonical HEAD.
	#[arg(long, default_value = "mock://init")]
	pub initial_cid: String,
	/// EVM signer for registry write tx: dev name (alice/bob/charlie) or 0x private key.
	#[arg(long, default_value = "alice")]
	pub signer: String,
	/// Contributor role grantee (defaults to signer address).
	#[arg(long)]
	pub contributor: Option<String>,
	/// Reviewer role grantee (defaults to contributor/signer address).
	#[arg(long)]
	pub reviewer: Option<String>,
	/// Skip contributor/reviewer role grants after repo creation.
	#[arg(long, default_value_t = false)]
	pub skip_role_grants: bool,
	/// Test only the pwallet pairing / Statement Store / signing transport.
	/// Skips all EVM registry reads and writes.
	#[arg(long, default_value_t = false)]
	pub transport_only: bool,
}

#[derive(Clone, Args)]
pub struct CrrpCommonArgs {
	/// Optional repository path (defaults to current directory).
	#[arg(long)]
	pub repo: Option<std::path::PathBuf>,
	/// Optional repository organization override. Defaults to .crrp/repo-slug.json.
	#[arg(long)]
	pub organization: Option<String>,
	/// Optional repository name override. Defaults to .crrp/repo-slug.json.
	#[arg(long)]
	pub repository: Option<String>,
	/// Optional repo ID override (internal/advanced). When omitted, derived from organization/repository.
	#[arg(long)]
	pub repo_id: Option<String>,
	/// Optional registry contract address override.
	#[arg(long)]
	pub registry: Option<String>,
	/// Use local mock backend instead of eth-rpc contract reads/writes.
	#[arg(long, env = "CRRP_MOCK", default_value_t = false)]
	pub mock: bool,
	/// Allow running CRRP commands outside main branch (testing only).
	#[arg(long, env = "CRRP_ALLOW_NON_MAIN", default_value_t = false)]
	pub allow_non_main: bool,
	/// Wallet backend for signature-requiring CRRP commands.
	#[arg(long, value_enum)]
	pub wallet_backend: Option<WalletBackend>,
	/// Optional metadata URL passed to papp-term auth handshake.
	#[arg(long, env = "CRRP_PAPP_TERM_METADATA")]
	pub papp_term_metadata: Option<String>,
	/// Optional statement-store endpoint passed to papp-term.
	#[arg(long, env = "CRRP_PAPP_TERM_ENDPOINT")]
	pub papp_term_endpoint: Option<String>,
	/// Substrate signer used for Bulletin extrinsic upload.
	/// Supports dev accounts, mnemonic phrase, or 0x secret seed.
	#[arg(long, env = "CRRP_BULLETIN_SIGNER")]
	pub bulletin_signer: Option<String>,
}

#[derive(Args)]
pub struct ProposeArgs {
	#[command(flatten)]
	pub common: CrrpCommonArgs,
	/// Commit to submit (defaults to HEAD).
	#[arg(long)]
	pub commit: Option<String>,
	/// Dry-run: print planned steps without network submission.
	#[arg(long)]
	pub dry_run: bool,
}

#[derive(Args)]
pub struct FetchArgs {
	#[command(flatten)]
	pub common: CrrpCommonArgs,
	/// Proposal ID to fetch.
	/// On-chain this is `uint256`; CLI currently accepts the `u64` subset.
	pub proposal_id: u64,
	/// Optional destination directory for fetched bundle.
	#[arg(long)]
	pub into: Option<std::path::PathBuf>,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, ValueEnum)]
pub enum ReviewDecision {
	Approve,
	Reject,
}

#[derive(Args)]
pub struct ReviewArgs {
	#[command(flatten)]
	pub common: CrrpCommonArgs,
	/// Proposal ID to review.
	/// On-chain this is `uint256`; CLI currently accepts the `u64` subset.
	pub proposal_id: u64,
	/// Review decision.
	#[arg(long, value_enum)]
	pub decision: ReviewDecision,
}

#[derive(Args)]
pub struct MergeArgs {
	#[command(flatten)]
	pub common: CrrpCommonArgs,
	/// Proposal ID to merge.
	/// On-chain this is `uint256`; CLI currently accepts the `u64` subset.
	pub proposal_id: u64,
	/// Dry-run: print planned steps without network submission.
	#[arg(long)]
	pub dry_run: bool,
}

#[derive(Args)]
pub struct ReleaseArgs {
	#[command(flatten)]
	pub common: CrrpCommonArgs,
	/// Version string (e.g. v1.2.0).
	pub version: String,
	/// Dry-run: print planned steps without network submission.
	#[arg(long)]
	pub dry_run: bool,
}

#[derive(Args)]
pub struct StatusArgs {
	#[command(flatten)]
	pub common: CrrpCommonArgs,
}

#[derive(Args)]
pub struct RepoArgs {
	#[command(flatten)]
	pub common: CrrpCommonArgs,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, ValueEnum)]
pub enum ProposalStateFilter {
	Open,
	Rejected,
	Merged,
}

#[derive(Args)]
pub struct ProposalsArgs {
	#[command(flatten)]
	pub common: CrrpCommonArgs,
	/// Optional state filter.
	#[arg(long, value_enum)]
	pub state: Option<ProposalStateFilter>,
	/// Max number of proposals to list.
	#[arg(long, default_value_t = 20)]
	pub limit: u16,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, ValueEnum)]
pub enum WalletBackend {
	Mock,
	#[value(alias = "pwallet")]
	Papp,
}
