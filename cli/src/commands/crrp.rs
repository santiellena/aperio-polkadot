use alloy::{
	primitives::{Address, FixedBytes},
	providers::ProviderBuilder,
	sol,
};
use blake2::{Blake2b512, Digest};
use clap::{Args, ValueEnum};
use serde::{Deserialize, Serialize};
use std::{
	collections::BTreeMap,
	fs,
	path::{Path, PathBuf},
	process::Command,
	time::{SystemTime, UNIX_EPOCH},
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
	/// Use local mock backend instead of eth-rpc contract reads/writes.
	#[arg(long, env = "CRRP_MOCK", default_value_t = false)]
	pub mock: bool,
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

#[derive(Copy, Clone, Eq, PartialEq)]
enum Backend {
	Rpc,
	Mock,
}

#[derive(Default, Serialize, Deserialize)]
struct MockState {
	#[serde(default)]
	repos: BTreeMap<String, MockRepoState>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
struct MockRepoState {
	#[serde(default)]
	proposal_count: u64,
	#[serde(default)]
	release_count: u64,
	#[serde(default)]
	head_cid: String,
}

struct CrrpContext {
	backend: Backend,
	repo_root: PathBuf,
	repo_id: FixedBytes<32>,
	registry: Address,
	maintainer: Address,
	head_commit: FixedBytes<32>,
	head_cid: String,
	proposal_count: String,
	release_count: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct WalletSession {
	session_id: String,
	created_at_unix_secs: u64,
	wallet_label: String,
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
	if !args.dry_run {
		ensure_wallet_session(&ctx.repo_root, "proposal submission")?;
	}
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
	} else if ctx.backend == Backend::Mock {
		let mut state = load_mock_state(&ctx.repo_root)?;
		let repo_state = mock_repo_state_mut(&mut state, ctx.repo_id);
		let proposal_id = repo_state.proposal_count;
		repo_state.proposal_count += 1;
		save_mock_state(&ctx.repo_root, &state)?;
		println!("Mock backend: stored local proposal #{proposal_id}.");
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
	ensure_wallet_session(&ctx.repo_root, "review submission")?;
	println!("Reviewing proposal {}...", args.proposal_id);
	println!("Repository: {}", ctx.repo_root.display());
	println!("Repo ID: {:#x}", ctx.repo_id);
	println!("Decision: {:?}", args.decision);
	println!("Skeleton: request wallet signature -> submit on-chain review.");
	if ctx.backend == Backend::Mock {
		println!("Mock backend: review accepted locally (no transaction submitted).");
	}
	Ok(())
}

async fn run_merge(args: MergeArgs, eth_rpc_url: &str) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url).await?;
	if !args.dry_run {
		ensure_wallet_session(&ctx.repo_root, "proposal merge")?;
	}
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
	} else if ctx.backend == Backend::Mock {
		let mut state = load_mock_state(&ctx.repo_root)?;
		let repo_state = mock_repo_state_mut(&mut state, ctx.repo_id);
		if args.proposal_id >= repo_state.proposal_count {
			return Err(format!(
				"Mock backend: proposal {} not found for this repo.",
				args.proposal_id
			)
			.into());
		}

		repo_state.head_cid = format!("mock://merge/{}", args.proposal_id);
		save_mock_state(&ctx.repo_root, &state)?;
		println!("Mock backend: proposal {} marked merged locally.", args.proposal_id);
	}

	Ok(())
}

async fn run_release(
	args: ReleaseArgs,
	eth_rpc_url: &str,
) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url).await?;
	if !args.dry_run {
		ensure_wallet_session(&ctx.repo_root, "release creation")?;
	}
	println!("Creating release {}...", args.version);
	println!("Repository: {}", ctx.repo_root.display());
	println!("Repo ID: {:#x}", ctx.repo_id);
	println!("Skeleton: read canonical HEAD -> request wallet signature -> submit release.");
	if args.dry_run {
		println!("Dry-run enabled: no signature/transaction executed.");
	} else if ctx.backend == Backend::Mock {
		let mut state = load_mock_state(&ctx.repo_root)?;
		let repo_state = mock_repo_state_mut(&mut state, ctx.repo_id);
		let release_id = repo_state.release_count;
		repo_state.release_count += 1;
		save_mock_state(&ctx.repo_root, &state)?;
		println!("Mock backend: release {} recorded locally as #{}.", args.version, release_id);
	}

	Ok(())
}

async fn run_status(args: StatusArgs, eth_rpc_url: &str) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url).await?;
	let branch = git_output(&ctx.repo_root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
	let local_head = git_output(&ctx.repo_root, &["rev-parse", "HEAD"])?;

	println!("CRRP Status (skeleton)");
	println!("Backend: {}", if ctx.backend == Backend::Mock { "mock" } else { "rpc" });
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
	println!("Backend: {}", if ctx.backend == Backend::Mock { "mock" } else { "rpc" });
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
	println!("Backend: {}", if ctx.backend == Backend::Mock { "mock" } else { "rpc" });
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

	if common.mock {
		let state = load_mock_state(&repo_root)?;
		let repo_state = state.repos.get(&repo_key(repo_id)).cloned().unwrap_or_default();
		let registry = match common.registry.as_deref() {
			Some(addr) => addr.parse()?,
			None => Address::ZERO,
		};

		return Ok(CrrpContext {
			backend: Backend::Mock,
			repo_root,
			repo_id,
			registry,
			maintainer: Address::ZERO,
			head_commit: FixedBytes::ZERO,
			head_cid: if repo_state.head_cid.is_empty() {
				"mock://head".to_string()
			} else {
				repo_state.head_cid
			},
			proposal_count: repo_state.proposal_count.to_string(),
			release_count: repo_state.release_count.to_string(),
		});
	}

	let registry = resolve_registry_address(common.registry.as_deref(), &repo_root)?;

	let provider = ProviderBuilder::new().connect_http(eth_rpc_url.parse()?);
	let contract = CRRPRepositoryRegistry::new(registry, &provider);
	let repo_data = contract.getRepo(repo_id).call().await.map_err(|error| {
		format!("Repo is not registered on CRRP registry (or RPC unavailable): {error}")
	})?;

	Ok(CrrpContext {
		backend: Backend::Rpc,
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

fn repo_key(repo_id: FixedBytes<32>) -> String {
	format!("{:#x}", repo_id)
}

fn mock_state_path(repo_root: &Path) -> PathBuf {
	repo_root.join(".crrp").join("mock-state.json")
}

fn wallet_session_path(repo_root: &Path) -> PathBuf {
	repo_root.join(".crrp").join("wallet-session.json")
}

fn load_mock_state(repo_root: &Path) -> Result<MockState, Box<dyn std::error::Error>> {
	let path = mock_state_path(repo_root);
	if !path.exists() {
		return Ok(MockState::default());
	}

	let raw = fs::read_to_string(path)?;
	Ok(serde_json::from_str(&raw)?)
}

fn save_mock_state(repo_root: &Path, state: &MockState) -> Result<(), Box<dyn std::error::Error>> {
	let dir = repo_root.join(".crrp");
	fs::create_dir_all(&dir)?;
	let path = mock_state_path(repo_root);
	fs::write(path, serde_json::to_string_pretty(state)? + "\n")?;
	Ok(())
}

fn load_wallet_session(
	repo_root: &Path,
) -> Result<Option<WalletSession>, Box<dyn std::error::Error>> {
	let path = wallet_session_path(repo_root);
	if !path.exists() {
		return Ok(None);
	}
	let raw = fs::read_to_string(path)?;
	Ok(Some(serde_json::from_str(&raw)?))
}

fn save_wallet_session(
	repo_root: &Path,
	session: &WalletSession,
) -> Result<(), Box<dyn std::error::Error>> {
	let dir = repo_root.join(".crrp");
	fs::create_dir_all(&dir)?;
	let path = wallet_session_path(repo_root);
	fs::write(path, serde_json::to_string_pretty(session)? + "\n")?;
	Ok(())
}

fn ensure_wallet_session(
	repo_root: &Path,
	action_label: &str,
) -> Result<WalletSession, Box<dyn std::error::Error>> {
	if let Some(session) = load_wallet_session(repo_root)? {
		println!(
			"Wallet session active ({}). Continuing with {}.",
			session.session_id, action_label
		);
		return Ok(session);
	}

	println!("Wallet sign-in required for {}.", action_label);
	println!("Scan this QR with your phone wallet to sign in:");
	let session = create_mock_wallet_session(repo_root)?;
	print_mock_qr(&session_uri(&session));
	println!("Sign-in URI: {}", session_uri(&session));
	save_wallet_session(repo_root, &session)?;
	println!("Wallet connected (mock session {}).", session.session_id);
	Ok(session)
}

fn create_mock_wallet_session(
	repo_root: &Path,
) -> Result<WalletSession, Box<dyn std::error::Error>> {
	let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
	let mut hasher = Blake2b512::new();
	hasher.update(repo_root.display().to_string().as_bytes());
	hasher.update(now.to_le_bytes());
	let digest = hasher.finalize();
	let session_id = hex::encode(&digest[..8]);

	Ok(WalletSession {
		session_id,
		created_at_unix_secs: now,
		wallet_label: "pwallet-mock".to_string(),
	})
}

fn session_uri(session: &WalletSession) -> String {
	format!("crrp://wallet-connect?session={}&wallet={}", session.session_id, session.wallet_label)
}

fn print_mock_qr(payload: &str) {
	let size = 25usize;
	let mut bits = Vec::with_capacity(size * size);
	let mut counter = 0u64;

	while bits.len() < size * size {
		let mut hasher = Blake2b512::new();
		hasher.update(payload.as_bytes());
		hasher.update(counter.to_le_bytes());
		let digest = hasher.finalize();
		for byte in digest {
			for bit in 0..8 {
				bits.push(((byte >> bit) & 1) == 1);
				if bits.len() == size * size {
					break;
				}
			}
			if bits.len() == size * size {
				break;
			}
		}
		counter += 1;
	}

	println!("Mock QR:");
	for y in 0..(size + 4) {
		let mut line = String::with_capacity((size + 4) * 2);
		for x in 0..(size + 4) {
			let dark = if x < 2 || y < 2 || x >= size + 2 || y >= size + 2 {
				true
			} else {
				bits[(y - 2) * size + (x - 2)]
			};
			line.push_str(if dark { "██" } else { "  " });
		}
		println!("{line}");
	}
}

fn mock_repo_state_mut(state: &mut MockState, repo_id: FixedBytes<32>) -> &mut MockRepoState {
	state.repos.entry(repo_key(repo_id)).or_default()
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

#[cfg(test)]
mod tests {
	use super::*;
	use std::{
		sync::atomic::{AtomicU64, Ordering},
		time::{SystemTime, UNIX_EPOCH},
	};

	const TEST_REPO_ID_HEX: &str =
		"0x1111111111111111111111111111111111111111111111111111111111111111";
	static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(0);

	struct TempRepo {
		path: PathBuf,
	}

	impl TempRepo {
		fn new() -> Result<Self, Box<dyn std::error::Error>> {
			let nanos = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
			let serial = NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed);
			let path = std::env::temp_dir()
				.join(format!("crrp-cli-mock-test-{}-{nanos}-{serial}", std::process::id()));
			fs::create_dir_all(&path)?;

			run_git(&path, &["init", "-b", "main"])?;
			run_git(&path, &["config", "user.name", "CRRP Test"])?;
			run_git(&path, &["config", "user.email", "crrp-test@example.com"])?;

			fs::write(path.join("README.md"), "test\n")?;
			run_git(&path, &["add", "README.md"])?;
			run_git(&path, &["commit", "-m", "init"])?;

			let crrp_dir = path.join(".crrp");
			fs::create_dir_all(&crrp_dir)?;
			fs::write(crrp_dir.join("repo-id"), format!("{TEST_REPO_ID_HEX}\n"))?;

			Ok(Self { path })
		}
	}

	impl Drop for TempRepo {
		fn drop(&mut self) {
			let _ = fs::remove_dir_all(&self.path);
		}
	}

	fn run_git(repo_root: &Path, args: &[&str]) -> Result<(), Box<dyn std::error::Error>> {
		let output = Command::new("git").args(args).current_dir(repo_root).output()?;
		if !output.status.success() {
			let stderr = String::from_utf8(output.stderr)?;
			return Err(format!("git {} failed: {}", args.join(" "), stderr.trim()).into());
		}
		Ok(())
	}

	fn mock_common(repo: &Path) -> CrrpCommonArgs {
		CrrpCommonArgs { repo: Some(repo.to_path_buf()), repo_id: None, registry: None, mock: true }
	}

	fn test_repo_id() -> FixedBytes<32> {
		TEST_REPO_ID_HEX.parse().expect("valid repo id")
	}

	#[tokio::test]
	async fn preflight_uses_mock_backend_without_rpc() -> Result<(), Box<dyn std::error::Error>> {
		let repo = TempRepo::new()?;

		let ctx = preflight(&mock_common(&repo.path), "http://127.0.0.1:1").await?;
		assert!(matches!(ctx.backend, Backend::Mock));
		assert_eq!(ctx.registry, Address::ZERO);
		assert_eq!(ctx.proposal_count, "0");
		assert_eq!(ctx.release_count, "0");
		assert_eq!(ctx.head_cid, "mock://head");

		Ok(())
	}

	#[tokio::test]
	async fn mock_lifecycle_updates_local_state() -> Result<(), Box<dyn std::error::Error>> {
		let repo = TempRepo::new()?;
		let common = mock_common(&repo.path);
		let repo_id = test_repo_id();

		run_propose(ProposeArgs { common: common.clone(), dry_run: false }, "http://127.0.0.1:1")
			.await?;

		run_merge(
			MergeArgs { common: common.clone(), proposal_id: 0, dry_run: false },
			"http://127.0.0.1:1",
		)
		.await?;

		run_release(
			ReleaseArgs { common, version: "v0.1.0".to_string(), dry_run: false },
			"http://127.0.0.1:1",
		)
		.await?;

		let state = load_mock_state(&repo.path)?;
		let repo_state = state.repos.get(&repo_key(repo_id)).expect("repo state exists");
		assert_eq!(repo_state.proposal_count, 1);
		assert_eq!(repo_state.release_count, 1);
		assert_eq!(repo_state.head_cid, "mock://merge/0");
		assert!(load_wallet_session(&repo.path)?.is_some());

		Ok(())
	}

	#[tokio::test]
	async fn mock_merge_rejects_unknown_proposal() -> Result<(), Box<dyn std::error::Error>> {
		let repo = TempRepo::new()?;
		let error = run_merge(
			MergeArgs { common: mock_common(&repo.path), proposal_id: 0, dry_run: false },
			"http://127.0.0.1:1",
		)
		.await
		.expect_err("merge should fail when proposal is missing");

		assert!(error.to_string().contains("proposal 0 not found"));
		Ok(())
	}

	#[tokio::test]
	async fn signature_hook_reuses_existing_wallet_session(
	) -> Result<(), Box<dyn std::error::Error>> {
		let repo = TempRepo::new()?;
		let common = mock_common(&repo.path);

		run_propose(ProposeArgs { common: common.clone(), dry_run: false }, "http://127.0.0.1:1")
			.await?;
		let first = load_wallet_session(&repo.path)?.expect("wallet session should exist");

		run_review(
			ReviewArgs {
				common: common.clone(),
				proposal_id: 0,
				decision: ReviewDecision::Approve,
			},
			"http://127.0.0.1:1",
		)
		.await?;
		run_merge(MergeArgs { common, proposal_id: 0, dry_run: false }, "http://127.0.0.1:1")
			.await?;

		let second = load_wallet_session(&repo.path)?.expect("wallet session should still exist");
		assert_eq!(first.session_id, second.session_id);
		Ok(())
	}

	#[tokio::test]
	async fn dry_run_does_not_create_wallet_session() -> Result<(), Box<dyn std::error::Error>> {
		let repo = TempRepo::new()?;
		run_propose(
			ProposeArgs { common: mock_common(&repo.path), dry_run: true },
			"http://127.0.0.1:1",
		)
		.await?;
		assert!(load_wallet_session(&repo.path)?.is_none());
		Ok(())
	}
}
