use std::{
	fs,
	path::{Path, PathBuf},
	process::Command,
	sync::atomic::{AtomicU64, Ordering},
	time::{SystemTime, UNIX_EPOCH},
};

use alloy::primitives::{Address, FixedBytes};
use crate::commands::config::{write_repo_id, write_repo_slug, RepoSlug};

use super::{
	args::{
		CreateRepoArgs, CrrpCommonArgs, FetchArgs, MergeArgs, ProposeArgs, ReleaseArgs, ReviewArgs,
		ReviewDecision, WalletBackend,
	},
	command::{run_create_repo, run_fetch, run_merge, run_propose, run_release, run_review},
	git::{git_output, short_commit_id},
	mock::{load_mock_state, repo_key},
	model::{Backend, MockProposalState, MockProposalStatus},
	preflight::{derive_repo_id, preflight},
	wallet::load_wallet_session,
};

const TEST_ORGANIZATION: &str = "acme";
const TEST_REPOSITORY: &str = "crrp";
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
		let repo_id = test_repo_id();
		write_repo_slug(
			&path,
			&RepoSlug {
				organization: TEST_ORGANIZATION.to_string(),
				repository: TEST_REPOSITORY.to_string(),
			},
		)?;
		write_repo_id(&path, &format!("{:#x}", repo_id))?;

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

fn checkout_branch(repo_root: &Path, branch: &str) -> Result<(), Box<dyn std::error::Error>> {
	run_git(repo_root, &["checkout", "-b", branch])
}

fn commit_file(
	repo_root: &Path,
	file_name: &str,
	contents: &str,
	message: &str,
) -> Result<String, Box<dyn std::error::Error>> {
	fs::write(repo_root.join(file_name), contents)?;
	run_git(repo_root, &["add", file_name])?;
	run_git(repo_root, &["commit", "-m", message])?;
	git_output(repo_root, &["rev-parse", "HEAD"])
}

fn proposal_for_repo(
	repo_root: &Path,
	repo_id: FixedBytes<32>,
	proposal_id: u64,
) -> Result<MockProposalState, Box<dyn std::error::Error>> {
	let state = load_mock_state(repo_root)?;
	let repo_state = state
		.repos
		.get(&repo_key(repo_id))
		.ok_or_else(|| format!("missing repo state for {:#x}", repo_id))?;
	repo_state
		.proposals
		.get(&proposal_id)
		.cloned()
		.ok_or_else(|| format!("missing proposal {proposal_id}").into())
}

fn mock_common(repo: &Path) -> CrrpCommonArgs {
	CrrpCommonArgs {
		repo: Some(repo.to_path_buf()),
		organization: None,
		repository: None,
		repo_id: None,
		registry: None,
		mock: true,
		allow_non_main: false,
		wallet_backend: Some(WalletBackend::Mock),
		papp_term_metadata: None,
		papp_term_endpoint: None,
		bulletin_signer: None,
	}
}

fn test_repo_id() -> FixedBytes<32> {
	derive_repo_id(TEST_ORGANIZATION, TEST_REPOSITORY)
}

#[tokio::test]
async fn preflight_uses_mock_backend_without_rpc() -> Result<(), Box<dyn std::error::Error>> {
	let repo = TempRepo::new()?;

	let ctx = preflight(&mock_common(&repo.path), Some("http://127.0.0.1:1")).await?;
	assert!(matches!(ctx.backend, Backend::Mock));
	assert_eq!(ctx.registry, Address::ZERO);
	assert_eq!(ctx.proposal_count, "0");
	assert_eq!(ctx.release_count, "0");
	assert_eq!(ctx.head_cid, "mock://head");

	Ok(())
}

#[tokio::test]
async fn mock_create_repo_initializes_state() -> Result<(), Box<dyn std::error::Error>> {
	let repo = TempRepo::new()?;
	let common = mock_common(&repo.path);

	run_create_repo(
		CreateRepoArgs {
			common: common.clone(),
			initial_commit: None,
			initial_cid: "mock://init".to_string(),
			signer: "alice".to_string(),
			contributor: None,
			reviewer: None,
			skip_role_grants: false,
			transport_only: false,
		},
		Some("http://127.0.0.1:1"),
	)
	.await?;

	let state = load_mock_state(&repo.path)?;
	let repo_state = state
		.repos
		.get(&repo_key(test_repo_id()))
		.ok_or("expected mock repo state to exist")?;
	assert_eq!(repo_state.proposal_count, 0);
	assert_eq!(repo_state.release_count, 0);
	assert_eq!(repo_state.head_cid, "mock://init");

	Ok(())
}

#[tokio::test]
async fn mock_create_repo_rejects_duplicate_repo() -> Result<(), Box<dyn std::error::Error>> {
	let repo = TempRepo::new()?;
	run_create_repo(
		CreateRepoArgs {
			common: mock_common(&repo.path),
			initial_commit: None,
			initial_cid: "mock://init".to_string(),
			signer: "alice".to_string(),
			contributor: None,
			reviewer: None,
			skip_role_grants: false,
			transport_only: false,
		},
		Some("http://127.0.0.1:1"),
	)
	.await?;
	let error = run_create_repo(
		CreateRepoArgs {
			common: mock_common(&repo.path),
			initial_commit: None,
			initial_cid: "mock://init".to_string(),
			signer: "alice".to_string(),
			contributor: None,
			reviewer: None,
			skip_role_grants: false,
			transport_only: false,
		},
		Some("http://127.0.0.1:1"),
	)
	.await
	.expect_err("creating an existing mock repo should fail");
	assert!(error.to_string().contains("already exists"));

	Ok(())
}

#[tokio::test]
async fn create_repo_fails_fast_on_repo_slug_mismatch() -> Result<(), Box<dyn std::error::Error>> {
	let repo = TempRepo::new()?;
	let mut common = mock_common(&repo.path);
	common.organization = Some("other-org".to_string());

	let error = run_create_repo(
		CreateRepoArgs {
			common,
			initial_commit: None,
			initial_cid: "mock://init".to_string(),
			signer: "alice".to_string(),
			contributor: None,
			reviewer: None,
			skip_role_grants: false,
			transport_only: false,
		},
		Some("http://127.0.0.1:1"),
	)
	.await
	.expect_err("repo slug mismatch should fail before any create-repo side effects");
	assert!(error.to_string().contains("Repository slug mismatch"));

	let state = load_mock_state(&repo.path)?;
	assert!(
		state.repos.is_empty(),
		"mock state should remain unchanged when repo-id mismatch fails"
	);
	Ok(())
}

#[tokio::test]
async fn preflight_rejects_non_main_by_default() -> Result<(), Box<dyn std::error::Error>> {
	let repo = TempRepo::new()?;
	checkout_branch(&repo.path, "feature/test")?;

	let result = preflight(&mock_common(&repo.path), Some("http://127.0.0.1:1")).await;
	assert!(result.is_err(), "preflight should reject non-main branch by default");
	let error = result.err().ok_or("expected preflight error on non-main")?;
	assert!(error.to_string().contains("only supports main branch"));
	Ok(())
}

#[tokio::test]
async fn preflight_allows_non_main_when_opted_in() -> Result<(), Box<dyn std::error::Error>> {
	let repo = TempRepo::new()?;
	checkout_branch(&repo.path, "feature/test")?;

	let mut common = mock_common(&repo.path);
	common.allow_non_main = true;
	let ctx = preflight(&common, Some("http://127.0.0.1:1")).await?;
	assert!(matches!(ctx.backend, Backend::Mock));

	common.allow_non_main = false;
	let config = crate::commands::config::RepoConfig {
		allow_non_main: true,
		..crate::commands::config::RepoConfig::default()
	};
	crate::commands::config::save_repo_config(&repo.path, &config)?;
	let from_config = preflight(&common, Some("http://127.0.0.1:1")).await?;
	assert!(matches!(from_config.backend, Backend::Mock));
	Ok(())
}

#[tokio::test]
async fn mock_lifecycle_updates_local_state() -> Result<(), Box<dyn std::error::Error>> {
	let repo = TempRepo::new()?;
	let proposed_commit = commit_file(&repo.path, "src.txt", "proposal\n", "proposal commit")?;
	let common = mock_common(&repo.path);
	let repo_id = test_repo_id();

	run_propose(
		ProposeArgs { common: common.clone(), commit: None, dry_run: false },
		Some("http://127.0.0.1:1"),
	)
	.await?;

	run_merge(
		MergeArgs { common: common.clone(), proposal_id: 0, dry_run: false },
		Some("http://127.0.0.1:1"),
	)
	.await?;

	run_release(
		ReleaseArgs { common, version: "v0.1.0".to_string(), dry_run: false },
		Some("http://127.0.0.1:1"),
	)
	.await?;

	let state = load_mock_state(&repo.path)?;
	let repo_state = state.repos.get(&repo_key(repo_id)).expect("repo state exists");
	assert_eq!(repo_state.proposal_count, 1);
	assert_eq!(repo_state.release_count, 1);
	let proposal = repo_state.proposals.get(&0).expect("proposal should exist");
	assert_eq!(proposal.commit, proposed_commit);
	assert_eq!(proposal.state, MockProposalStatus::Merged);
	assert_eq!(repo_state.head_cid, proposal.cid);
	assert!(load_wallet_session(&repo.path)?.is_some());

	Ok(())
}

#[tokio::test]
async fn mock_merge_rejects_unknown_proposal() -> Result<(), Box<dyn std::error::Error>> {
	let repo = TempRepo::new()?;
	let error = run_merge(
		MergeArgs { common: mock_common(&repo.path), proposal_id: 0, dry_run: false },
		Some("http://127.0.0.1:1"),
	)
	.await
	.expect_err("merge should fail when proposal is missing");

	assert!(error.to_string().contains("proposal 0 not found"));
	Ok(())
}

#[tokio::test]
async fn signature_hook_reuses_existing_wallet_session() -> Result<(), Box<dyn std::error::Error>> {
	let repo = TempRepo::new()?;
	commit_file(&repo.path, "src.txt", "proposal\n", "proposal commit")?;
	let common = mock_common(&repo.path);

	run_propose(
		ProposeArgs { common: common.clone(), commit: None, dry_run: false },
		Some("http://127.0.0.1:1"),
	)
	.await?;
	let first = load_wallet_session(&repo.path)?.expect("wallet session should exist");

	run_review(
		ReviewArgs { common: common.clone(), proposal_id: 0, decision: ReviewDecision::Approve },
		Some("http://127.0.0.1:1"),
	)
	.await?;
	run_merge(MergeArgs { common, proposal_id: 0, dry_run: false }, Some("http://127.0.0.1:1"))
		.await?;

	let second = load_wallet_session(&repo.path)?.expect("wallet session should still exist");
	assert_eq!(first.session_id, second.session_id);
	Ok(())
}

#[tokio::test]
async fn dry_run_does_not_create_wallet_session() -> Result<(), Box<dyn std::error::Error>> {
	let repo = TempRepo::new()?;
	commit_file(&repo.path, "src.txt", "proposal\n", "proposal commit")?;
	run_propose(
		ProposeArgs { common: mock_common(&repo.path), commit: None, dry_run: true },
		Some("http://127.0.0.1:1"),
	)
	.await?;
	assert!(load_wallet_session(&repo.path)?.is_none());
	Ok(())
}

#[tokio::test]
async fn mock_propose_creates_bundle_and_records_proposal() -> Result<(), Box<dyn std::error::Error>>
{
	let repo = TempRepo::new()?;
	let proposed_commit = commit_file(&repo.path, "src.txt", "proposal\n", "proposal commit")?;

	run_propose(
		ProposeArgs { common: mock_common(&repo.path), commit: None, dry_run: false },
		Some("http://127.0.0.1:1"),
	)
	.await?;

	let proposal = proposal_for_repo(&repo.path, test_repo_id(), 0)?;
	assert_eq!(proposal.commit, proposed_commit);
	assert!(proposal.cid.starts_with("mockcid-"));
	assert_eq!(proposal.state, MockProposalStatus::Open);

	let bundle_path = repo.path.join(&proposal.bundle_path);
	assert!(bundle_path.exists(), "bundle should be persisted in mock bulletin store");

	let output = Command::new("git")
		.arg("bundle")
		.arg("verify")
		.arg(&bundle_path)
		.current_dir(&repo.path)
		.output()?;
	assert!(
		output.status.success(),
		"git bundle verify failed: {}",
		String::from_utf8_lossy(&output.stderr)
	);

	Ok(())
}

#[tokio::test]
async fn mock_fetch_copies_saved_bundle() -> Result<(), Box<dyn std::error::Error>> {
	let repo = TempRepo::new()?;
	commit_file(&repo.path, "src.txt", "proposal\n", "proposal commit")?;

	run_propose(
		ProposeArgs { common: mock_common(&repo.path), commit: None, dry_run: false },
		Some("http://127.0.0.1:1"),
	)
	.await?;

	let destination_dir = repo.path.join("downloads");
	run_fetch(
		FetchArgs {
			common: mock_common(&repo.path),
			proposal_id: 0,
			into: Some(destination_dir.clone()),
		},
		Some("http://127.0.0.1:1"),
	)
	.await?;

	let proposal = proposal_for_repo(&repo.path, test_repo_id(), 0)?;
	let destination =
		destination_dir.join(format!("proposal-0-{}.bundle", short_commit_id(&proposal.commit)));
	assert!(destination.exists(), "fetch should copy the bundle into the target directory");

	Ok(())
}

#[tokio::test]
async fn propose_uses_explicit_commit_override() -> Result<(), Box<dyn std::error::Error>> {
	let repo = TempRepo::new()?;
	let first_commit = commit_file(&repo.path, "a.txt", "a\n", "commit a")?;
	commit_file(&repo.path, "b.txt", "b\n", "commit b")?;

	run_propose(
		ProposeArgs {
			common: mock_common(&repo.path),
			commit: Some(first_commit.clone()),
			dry_run: false,
		},
		Some("http://127.0.0.1:1"),
	)
	.await?;

	let proposal = proposal_for_repo(&repo.path, test_repo_id(), 0)?;
	assert_eq!(proposal.commit, first_commit);

	Ok(())
}

#[tokio::test]
async fn mock_propose_bundle_is_importable_in_fresh_repo() -> Result<(), Box<dyn std::error::Error>>
{
	let repo = TempRepo::new()?;
	let base_commit = commit_file(&repo.path, "base.txt", "base\n", "base commit")?;
	commit_file(&repo.path, "src.txt", "proposal\n", "proposal commit")?;

	run_propose(
		ProposeArgs { common: mock_common(&repo.path), commit: None, dry_run: false },
		Some("http://127.0.0.1:1"),
	)
	.await?;

	let proposal = proposal_for_repo(&repo.path, test_repo_id(), 0)?;
	assert_eq!(proposal.base_commit.as_deref(), Some(base_commit.as_str()));
	let bundle_path = repo.path.join(&proposal.bundle_path);

	let import_repo = TempRepo::new()?;
	run_git(&import_repo.path, &["checkout", "--detach"])?;

	let fetch_output = Command::new("git")
		.arg("fetch")
		.arg(&bundle_path)
		.arg(format!("{}:refs/crrp/imported", proposal.commit))
		.current_dir(&import_repo.path)
		.output()?;
	if !fetch_output.status.success() {
		return Err(format!(
			"git fetch from bundle failed: {}",
			String::from_utf8_lossy(&fetch_output.stderr)
		)
		.into());
	}

	let imported = git_output(&import_repo.path, &["rev-parse", "refs/crrp/imported"])?;
	assert_eq!(imported, proposal.commit);

	Ok(())
}
