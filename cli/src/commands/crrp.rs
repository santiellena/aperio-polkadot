use alloy::{
	primitives::{Address, FixedBytes},
	providers::ProviderBuilder,
	sol,
};
use clap::{Args, ValueEnum};
use serde::Deserialize;
use std::{
	fs,
	path::{Path, PathBuf},
	process::Command,
};

sol! {
	#[sol(rpc)]
	contract CRRPRepositoryRegistry {
		function getRepo(
			bytes32 repoId
		) external view returns (
			address maintainer,
			bytes32 headCommit,
			string memory headCid,
			uint256 proposalCount,
			uint256 releaseCount
		);
	}
}

#[derive(clap::Subcommand)]
pub enum CrrpAction {
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

#[derive(Clone, Args)]
pub struct CrrpCommonArgs {
	/// Optional repository path (defaults to current directory).
	#[arg(long)]
	pub repo: Option<PathBuf>,
	/// Optional repo ID override (0x-prefixed bytes32). Defaults to .crrp/repo-id.
	#[arg(long)]
	pub repo_id: Option<String>,
	/// Optional registry contract address override.
	#[arg(long)]
	pub registry: Option<String>,
}

#[derive(Args)]
pub struct ProposeArgs {
	#[command(flatten)]
	pub common: CrrpCommonArgs,
	/// Dry-run: print planned steps without network submission.
	#[arg(long)]
	pub dry_run: bool,
}

#[derive(Args)]
pub struct FetchArgs {
	#[command(flatten)]
	pub common: CrrpCommonArgs,
	/// Proposal ID to fetch.
	pub proposal_id: u64,
	/// Optional destination directory for fetched bundle.
	#[arg(long)]
	pub into: Option<PathBuf>,
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

#[derive(Deserialize)]
struct Deployments {
	evm: Option<String>,
}

struct CrrpContext {
	repo_root: PathBuf,
	repo_id: FixedBytes<32>,
	registry: Address,
	maintainer: Address,
	head_commit: FixedBytes<32>,
	head_cid: String,
	proposal_count: String,
	release_count: String,
}

pub async fn run(
	action: CrrpAction,
	_ws_url: &str,
	_eth_rpc_url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
	match action {
		CrrpAction::Propose(args) => run_propose(args, _eth_rpc_url).await?,
		CrrpAction::Fetch(args) => run_fetch(args, _eth_rpc_url).await?,
		CrrpAction::Review(args) => run_review(args, _eth_rpc_url).await?,
		CrrpAction::Merge(args) => run_merge(args, _eth_rpc_url).await?,
		CrrpAction::Release(args) => run_release(args, _eth_rpc_url).await?,
		CrrpAction::Status(args) => run_status(args, _eth_rpc_url).await?,
		CrrpAction::Repo(args) => run_repo(args, _eth_rpc_url).await?,
		CrrpAction::Proposals(args) => run_proposals(args, _eth_rpc_url).await?,
	}

	Ok(())
}

async fn run_propose(
	args: ProposeArgs,
	eth_rpc_url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url).await?;
	let head = git_output(&ctx.repo_root, &["rev-parse", "HEAD"])?;
	let base =
		git_output(&ctx.repo_root, &["rev-parse", "HEAD~1"]).unwrap_or_else(|_| head.clone());

	println!("Preparing proposal...");
	println!("Repository: {}", ctx.repo_root.display());
	println!("Repo ID: {:#x}", ctx.repo_id);
	println!("Registry: {}", ctx.registry);
	println!("Base commit: {base}");
	println!("HEAD commit: {head}");
	println!("Next steps (skeleton):");
	println!("1. Create Git bundle artifact");
	println!("2. Upload bundle and obtain CID");
	println!("3. Request wallet signature");
	println!("4. Submit proposal transaction");
	if args.dry_run {
		println!("Dry-run enabled: no upload/signature/transaction executed.");
	}

	Ok(())
}

async fn run_fetch(args: FetchArgs, eth_rpc_url: &str) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url).await?;
	let into = args
		.into
		.unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
	println!("Fetching proposal {}...", args.proposal_id);
	println!("Repository: {}", ctx.repo_root.display());
	println!("Repo ID: {:#x}", ctx.repo_id);
	println!("Target directory: {}", into.display());
	println!("Skeleton: resolve proposal CID -> download bundle -> import into local Git.");
	Ok(())
}

async fn run_review(args: ReviewArgs, eth_rpc_url: &str) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url).await?;
	println!("Reviewing proposal {}...", args.proposal_id);
	println!("Repository: {}", ctx.repo_root.display());
	println!("Repo ID: {:#x}", ctx.repo_id);
	println!("Decision: {:?}", args.decision);
	println!("Skeleton: request wallet signature -> submit on-chain review.");
	Ok(())
}

async fn run_merge(args: MergeArgs, eth_rpc_url: &str) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url).await?;
	let head = git_output(&ctx.repo_root, &["rev-parse", "HEAD"])?;

	println!("Merging proposal {}...", args.proposal_id);
	println!("Repository: {}", ctx.repo_root.display());
	println!("Repo ID: {:#x}", ctx.repo_id);
	println!("Current local HEAD: {head}");
	println!("Next steps (skeleton):");
	println!("1. Fetch proposal bundle");
	println!("2. Merge locally with Git and resolve conflicts");
	println!("3. Create final bundle and upload for CID");
	println!("4. Request wallet signature");
	println!("5. Submit merge transaction (update canonical HEAD)");
	if args.dry_run {
		println!("Dry-run enabled: no upload/signature/transaction executed.");
	}

	Ok(())
}

async fn run_release(
	args: ReleaseArgs,
	eth_rpc_url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url).await?;
	println!("Creating release {}...", args.version);
	println!("Repository: {}", ctx.repo_root.display());
	println!("Repo ID: {:#x}", ctx.repo_id);
	println!("Skeleton: read canonical HEAD -> request wallet signature -> submit release.");
	if args.dry_run {
		println!("Dry-run enabled: no signature/transaction executed.");
	}

	Ok(())
}

async fn run_status(args: StatusArgs, eth_rpc_url: &str) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url).await?;
	let branch = git_output(&ctx.repo_root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
	let local_head = git_output(&ctx.repo_root, &["rev-parse", "HEAD"])?;

	println!("CRRP Status (skeleton)");
	println!("Repository: {}", ctx.repo_root.display());
	println!("Repo ID: {:#x}", ctx.repo_id);
	println!("Registry: {}", ctx.registry);
	println!("Branch: {branch}");
	println!("Local HEAD: {local_head}");
	println!("On-chain HEAD: {:#x}", ctx.head_commit);
	println!("On-chain HEAD CID: {}", ctx.head_cid);
	println!("On-chain proposals: {}", ctx.proposal_count);
	println!("On-chain releases: {}", ctx.release_count);

	Ok(())
}

async fn run_repo(args: RepoArgs, eth_rpc_url: &str) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url).await?;
	println!("CRRP Repo (skeleton)");
	println!("Repository: {}", ctx.repo_root.display());
	println!("Repo ID: {:#x}", ctx.repo_id);
	println!("Registry: {}", ctx.registry);
	println!("Maintainer: {}", ctx.maintainer);
	println!("On-chain HEAD: {:#x}", ctx.head_commit);
	println!("On-chain HEAD CID: {}", ctx.head_cid);
	println!("Proposals: {}", ctx.proposal_count);
	println!("Releases: {}", ctx.release_count);

	Ok(())
}

async fn run_proposals(
	args: ProposalsArgs,
	eth_rpc_url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url).await?;
	println!("CRRP Proposals (skeleton)");
	println!("Repository: {}", ctx.repo_root.display());
	println!("Repo ID: {:#x}", ctx.repo_id);
	println!("Registry: {}", ctx.registry);
	println!("State filter: {:?}", args.state);
	println!("Limit: {}", args.limit);
	println!(
		"On-chain proposal count: {} (detailed listing will be added in next iteration).",
		ctx.proposal_count
	);

	Ok(())
}

async fn preflight(
	common: &CrrpCommonArgs,
	eth_rpc_url: &str,
) -> Result<CrrpContext, Box<dyn std::error::Error>> {
	let repo_root = detect_repo_root(common.repo.as_deref())?;
	let branch = git_output(&repo_root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
	if branch != "main" {
		return Err(format!("CRRP only supports main branch. Current branch: {branch}").into());
	}

	let repo_id = resolve_repo_id(common.repo_id.as_deref(), &repo_root)?;
	let registry = resolve_registry_address(common.registry.as_deref(), &repo_root)?;

	let provider = ProviderBuilder::new().connect_http(eth_rpc_url.parse()?);
	let contract = CRRPRepositoryRegistry::new(registry, &provider);
	let repo_data = contract.getRepo(repo_id).call().await.map_err(|error| {
		format!("Repo is not registered on CRRP registry (or RPC unavailable): {error}")
	})?;

	Ok(CrrpContext {
		repo_root,
		repo_id,
		registry,
		maintainer: repo_data.maintainer,
		head_commit: repo_data.headCommit,
		head_cid: repo_data.headCid,
		proposal_count: repo_data.proposalCount.to_string(),
		release_count: repo_data.releaseCount.to_string(),
	})
}

fn resolve_repo_id(
	repo_id_override: Option<&str>,
	repo_root: &Path,
) -> Result<FixedBytes<32>, Box<dyn std::error::Error>> {
	if let Some(repo_id) = repo_id_override {
		return Ok(repo_id.parse()?);
	}

	let config_path = repo_root.join(".crrp").join("repo-id");
	if !config_path.exists() {
		return Err(format!(
			"Missing repo ID config. Expected {} or pass --repo-id <0x...>",
			config_path.display()
		)
		.into());
	}

	let raw = fs::read_to_string(&config_path)?;
	let value = raw.trim();
	if value.is_empty() {
		return Err(format!("Repo ID file is empty: {}", config_path.display()).into());
	}

	Ok(value.parse()?)
}

fn resolve_registry_address(
	registry_override: Option<&str>,
	repo_root: &Path,
) -> Result<Address, Box<dyn std::error::Error>> {
	if let Some(addr) = registry_override {
		return Ok(addr.parse()?);
	}

	if let Ok(addr) = std::env::var("CRRP_REGISTRY_ADDRESS") {
		if !addr.trim().is_empty() {
			return Ok(addr.parse()?);
		}
	}

	for path in registry_candidates(repo_root) {
		if !path.exists() {
			continue;
		}

		let raw = fs::read_to_string(&path)?;
		let deployments: Deployments = serde_json::from_str(&raw)?;
		if let Some(addr) = deployments.evm {
			return Ok(addr.parse()?);
		}
	}

	Err(
		"Could not resolve registry contract address. Use --registry, CRRP_REGISTRY_ADDRESS, or deployments.json with evm address."
			.into(),
	)
}

fn registry_candidates(repo_root: &Path) -> Vec<PathBuf> {
	vec![
		repo_root.join("deployments.json"),
		PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../deployments.json"),
	]
}

fn detect_repo_root(repo_override: Option<&Path>) -> Result<PathBuf, Box<dyn std::error::Error>> {
	let cwd =
		if let Some(path) = repo_override { path.to_path_buf() } else { std::env::current_dir()? };

	let output = Command::new("git")
		.arg("rev-parse")
		.arg("--show-toplevel")
		.current_dir(cwd)
		.output()?;
	if !output.status.success() {
		return Err("Not inside a Git repository".into());
	}

	Ok(PathBuf::from(String::from_utf8(output.stdout)?.trim()))
}

fn git_output(repo_root: &Path, args: &[&str]) -> Result<String, Box<dyn std::error::Error>> {
	let output = Command::new("git").args(args).current_dir(repo_root).output()?;
	if !output.status.success() {
		let stderr = String::from_utf8(output.stderr)?;
		return Err(format!("git {} failed: {}", args.join(" "), stderr.trim()).into());
	}
	Ok(String::from_utf8(output.stdout)?.trim().to_string())
}
