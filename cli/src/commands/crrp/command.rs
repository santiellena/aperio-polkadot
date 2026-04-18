use std::{fs, path::PathBuf};

use alloy::{
	network::EthereumWallet,
	primitives::{Address, FixedBytes},
	providers::ProviderBuilder,
	signers::local::PrivateKeySigner,
	sol,
};

use crate::commands::config::{load_repo_config, read_repo_id_if_exists, write_repo_id};
use crate::commands::{resolve_substrate_signer, upload_to_bulletin};

use super::{
	args::{
		CreateRepoArgs, CrrpAction, FetchArgs, MergeArgs, ProposalsArgs, ProposeArgs, ReleaseArgs,
		RepoArgs, ReviewArgs, StatusArgs,
	},
	git::{
		create_mock_bundle_submission, detect_repo_root, git_output, prepare_proposal,
		relative_repo_path, unix_timestamp_secs,
	},
	mock::{
		load_mock_state, mock_proposal_status_label, mock_repo_state_mut, proposal_matches_filter,
		repo_key, resolve_fetch_destination, save_mock_state,
	},
	model::{Backend, CrrpContext, MockProposalState, MockProposalStatus, MockRepoState},
	preflight::{
		preflight, resolve_eth_rpc_url, resolve_registry_address, resolve_repo_id,
		resolve_wallet_backend,
	},
	wallet::{ensure_wallet_session, request_wallet_tx_approval},
};

// Well-known Substrate dev account private keys (Ethereum-format).
// These are public test keys from standard dev mnemonics. Never use for production funds.
const ALICE_KEY: &str = "0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133";
const BOB_KEY: &str = "0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b";
const CHARLIE_KEY: &str = "0x0b6e18cafb6ed99687ec547bd28139cafbd3a4f28014f8640076aba0082bf262";

sol! {
	#[sol(rpc)]
	contract CRRPRepositoryRegistryWrite {
		function getRepo(
			bytes32 repoId
		) external view returns (
			address maintainer,
			bytes32 headCommit,
			string memory headCid,
			uint256 proposalCount,
			uint256 releaseCount
		);
		function createRepo(bytes32 repoId, bytes32 initialHeadCommit, string calldata initialHeadCid) external;
		function setContributorRole(bytes32 repoId, address account, bool enabled) external;
		function setReviewerRole(bytes32 repoId, address account, bool enabled) external;
	}
}

pub async fn run(
	action: CrrpAction,
	eth_rpc_url_override: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
	match action {
		CrrpAction::CreateRepo(args) => run_create_repo(args, eth_rpc_url_override).await?,
		CrrpAction::Propose(args) => run_propose(args, eth_rpc_url_override).await?,
		CrrpAction::Fetch(args) => run_fetch(args, eth_rpc_url_override).await?,
		CrrpAction::Review(args) => run_review(args, eth_rpc_url_override).await?,
		CrrpAction::Merge(args) => run_merge(args, eth_rpc_url_override).await?,
		CrrpAction::Release(args) => run_release(args, eth_rpc_url_override).await?,
		CrrpAction::Status(args) => run_status(args, eth_rpc_url_override).await?,
		CrrpAction::Repo(args) => run_repo(args, eth_rpc_url_override).await?,
		CrrpAction::Proposals(args) => run_proposals(args, eth_rpc_url_override).await?,
	}

	Ok(())
}

pub(super) async fn run_create_repo(
	args: CreateRepoArgs,
	eth_rpc_url_override: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
	let repo_root = detect_repo_root(args.common.repo.as_deref())?;
	let repo_config = load_repo_config(&repo_root)?;
	let branch = git_output(&repo_root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
	let allow_non_main = args.common.allow_non_main || repo_config.allow_non_main;
	if branch != "main" && !allow_non_main {
		return Err(format!(
			"CRRP only supports main branch. Current branch: {branch}. Use --allow-non-main or set allowNonMain=true in .crrp/config.json for testing."
		)
		.into());
	}

	let repo_id = resolve_repo_id(args.common.repo_id.as_deref(), &repo_root)?;
	assert_repo_id_compatible(&repo_root, repo_id)?;
	let wallet_backend = resolve_wallet_backend(args.common.wallet_backend, &repo_config)?;
	let papp_term_metadata = args
		.common
		.papp_term_metadata
		.clone()
		.or_else(|| repo_config.papp_term_metadata.clone());
	let papp_term_endpoint = args
		.common
		.papp_term_endpoint
		.clone()
		.or_else(|| repo_config.papp_term_endpoint.clone());
	let initial_commit_ref =
		args.initial_commit.as_deref().map(str::trim).filter(|v| !v.is_empty());
	let resolved_commit =
		git_output(&repo_root, &["rev-parse", "--verify", initial_commit_ref.unwrap_or("HEAD")])?;
	let initial_head_commit = commit_hex_to_bytes32(&resolved_commit)?;
	let initial_head_cid = args.initial_cid.trim();
	if initial_head_cid.is_empty() {
		return Err("--initial-cid cannot be empty".into());
	}

	if args.common.mock {
		let mut state = load_mock_state(&repo_root)?;
		let key = repo_key(repo_id);
		if state.repos.contains_key(&key) {
			return Err(format!("Mock backend: repo {:#x} already exists.", repo_id).into());
		}
		state.repos.insert(
			key,
			MockRepoState { head_cid: initial_head_cid.to_string(), ..MockRepoState::default() },
		);
		save_mock_state(&repo_root, &state)?;
		write_repo_id_if_missing(&repo_root, repo_id)?;

		println!("Mock backend: repository created.");
		println!("Repository: {}", repo_root.display());
		println!("Repo ID: {:#x}", repo_id);
		println!("Initial HEAD: {resolved_commit}");
		println!("Initial CID: {initial_head_cid}");
		return Ok(());
	}

	let signer = resolve_evm_signer(&args.signer)?;
	let signer_address = signer.address();
	let contributor = resolve_optional_address(args.contributor.as_deref(), signer_address)?;
	let reviewer = resolve_optional_address(args.reviewer.as_deref(), contributor)?;
	let eth_rpc_url = resolve_eth_rpc_url(eth_rpc_url_override, &repo_config);
	let registry = resolve_registry_address(
		args.common.registry.as_deref(),
		repo_config.registry.as_deref(),
		&repo_root,
	)?;
	let wallet = EthereumWallet::from(signer);
	let provider = ProviderBuilder::new().wallet(wallet).connect_http(eth_rpc_url.parse()?);
	let registry_contract = CRRPRepositoryRegistryWrite::new(registry, &provider);
	match registry_contract.getRepo(repo_id).call().await {
		Ok(existing_repo) => {
			return Err(format!(
				"Repo already exists on registry (maintainer {}). Use a different --repo-id or continue with this repo.",
				existing_repo.maintainer
			)
			.into())
		},
		Err(error) => {
			let message = error.to_string();
			if !message.contains("Repo not found") {
				return Err(format!(
					"Failed to verify repo existence before create-repo: {error}"
				)
				.into());
			}
		},
	}

	let wallet_ctx = CrrpContext {
		backend: Backend::Rpc,
		repo_root: repo_root.clone(),
		repo_id,
		substrate_rpc_ws: String::new(),
		registry,
		maintainer: Address::ZERO,
		head_commit: FixedBytes::ZERO,
		head_cid: String::new(),
		proposal_count: "0".to_string(),
		release_count: "0".to_string(),
		wallet_backend,
		papp_term_metadata,
		papp_term_endpoint,
	};
	let wallet_session = ensure_wallet_session(&wallet_ctx, "repository creation").await?;
	let approval = request_wallet_tx_approval(
		&wallet_ctx,
		"CRRP create-repo signature request",
		&format!(
			"repo_id={:#x}, registry={}, initial_head={}, initial_cid={}, signer={}",
			repo_id, registry, resolved_commit, initial_head_cid, signer_address
		),
	)
	.await?;
	let create_receipt = registry_contract
		.createRepo(repo_id, initial_head_commit, initial_head_cid.to_string())
		.send()
		.await?
		.get_receipt()
		.await?;

	println!("Repository created on-chain.");
	println!("Repository: {}", repo_root.display());
	println!("Repo ID: {:#x}", repo_id);
	println!("Registry: {registry}");
	println!("Signer: {signer_address}");
	println!("Initial HEAD: {resolved_commit}");
	println!("Initial CID: {initial_head_cid}");
	println!("createRepo tx: {}", create_receipt.transaction_hash);
	println!("Wallet session: {}", wallet_session.session_id);
	println!("Wallet approval id: {}", approval.approval_id);
	println!("Wallet approval timestamp: {}", approval.approved_at_unix_secs);
	println!(
		"Note: createRepo tx submission still uses --signer; pwallet signing submission is pending."
	);

	if !args.skip_role_grants {
		let contributor_receipt = registry_contract
			.setContributorRole(repo_id, contributor, true)
			.send()
			.await?
			.get_receipt()
			.await?;
		let reviewer_receipt = registry_contract
			.setReviewerRole(repo_id, reviewer, true)
			.send()
			.await?
			.get_receipt()
			.await?;
		println!(
			"Contributor role granted to {} (tx {}).",
			contributor, contributor_receipt.transaction_hash
		);
		println!(
			"Reviewer role granted to {} (tx {}).",
			reviewer, reviewer_receipt.transaction_hash
		);
	}

	write_repo_id_if_missing(&repo_root, repo_id)?;

	Ok(())
}

pub(super) async fn run_propose(
	args: ProposeArgs,
	eth_rpc_url_override: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url_override).await?;
	let proposal = prepare_proposal(&ctx.repo_root, args.commit.as_deref())?;

	println!("Preparing proposal...");
	println!("Repository: {}", ctx.repo_root.display());
	println!("Repo ID: {:#x}", ctx.repo_id);
	println!("Registry: {}", ctx.registry);
	println!("Selected commit: {}", proposal.commit);
	match proposal.base_commit.as_deref() {
		Some(base_commit) => println!("Bundle base commit: {base_commit}"),
		None => println!("Bundle base commit: <root commit>"),
	}
	println!("Next steps:");
	println!("1. Create Git bundle artifact for selected commit");
	println!("2. Submit bundle to Bulletin abstraction and obtain mock CID");
	println!("3. Reuse or establish wallet session");
	println!("4. Record proposal submission in selected backend");
	if args.dry_run {
		println!("Dry-run enabled: no bundle/upload/signature/transaction executed.");
	} else if ctx.backend == Backend::Mock {
		let bundle_submission = create_mock_bundle_submission(&ctx.repo_root, &proposal)?;
		let wallet_session = ensure_wallet_session(&ctx, "proposal submission").await?;
		let mut state = load_mock_state(&ctx.repo_root)?;
		let repo_state = mock_repo_state_mut(&mut state, ctx.repo_id);
		let proposal_id = repo_state.proposal_count;
		repo_state.proposal_count += 1;
		repo_state.proposals.insert(
			proposal_id,
			MockProposalState {
				commit: proposal.commit.clone(),
				base_commit: proposal.base_commit.clone(),
				cid: bundle_submission.cid.clone(),
				bundle_path: relative_repo_path(&ctx.repo_root, &bundle_submission.bundle_path),
				state: MockProposalStatus::Open,
				submitted_at_unix_secs: unix_timestamp_secs()?,
			},
		);
		save_mock_state(&ctx.repo_root, &state)?;
		println!("Mock backend: proposal submitted successfully.");
		println!("Proposal ID: {proposal_id}");
		println!("Bundle path: {}", bundle_submission.bundle_path.display());
		println!("Mock CID: {}", bundle_submission.cid);
		println!("Wallet session: {}", wallet_session.session_id);
	} else {
		let bundle_submission = create_mock_bundle_submission(&ctx.repo_root, &proposal)?;
		let wallet_session = ensure_wallet_session(&ctx, "proposal submission").await?;
		let signer_input = args.common.bulletin_signer.as_deref().ok_or(
			"Missing --bulletin-signer for non-mock propose. Provide a dev account, mnemonic phrase, or 0x secret seed for Bulletin upload.",
		)?;
		let signer = resolve_substrate_signer(signer_input)?;
		let bundle_bytes = fs::read(&bundle_submission.bundle_path)?;
		let approval = request_wallet_tx_approval(
			&ctx,
			"Bulletin upload signature request",
			&format!(
				"repo_id={:#x}, commit={}, bundle_bytes={}",
				ctx.repo_id,
				proposal.commit,
				bundle_bytes.len()
			),
		)
		.await?;
		let extrinsic_hash =
			upload_to_bulletin(&bundle_bytes, &ctx.substrate_rpc_ws, &signer).await?;

		println!("Bulletin upload submitted.");
		println!("Bulletin RPC: {}", ctx.substrate_rpc_ws);
		println!("Bulletin extrinsic hash: {extrinsic_hash}");
		println!("Local bundle path: {}", bundle_submission.bundle_path.display());
		println!("Local CID placeholder: {}", bundle_submission.cid);
		println!("Wallet session: {}", wallet_session.session_id);
		println!("Wallet approval id: {}", approval.approval_id);
		println!("Wallet approval timestamp: {}", approval.approved_at_unix_secs);
		println!(
			"Note: extrinsic signing still uses --bulletin-signer; pwallet signing submission is pending."
		);
		println!(
			"Contract submission step still pending: use proposal commit + Bulletin-backed artifact reference."
		);
	}

	Ok(())
}

fn resolve_evm_signer(input: &str) -> Result<PrivateKeySigner, Box<dyn std::error::Error>> {
	let trimmed = input.trim();
	if trimmed.is_empty() {
		return Err("Signer cannot be empty. Use alice/bob/charlie or a 0x private key.".into());
	}

	let lowered = trimmed.to_lowercase();
	let key = match lowered.as_str() {
		"alice" => ALICE_KEY,
		"bob" => BOB_KEY,
		"charlie" => CHARLIE_KEY,
		_ => trimmed,
	};

	if !key.starts_with("0x") {
		return Err(format!(
			"Unknown signer {trimmed}. Use alice/bob/charlie or a 0x private key."
		)
		.into());
	}

	Ok(key.parse()?)
}

fn resolve_optional_address(
	value: Option<&str>,
	default_value: Address,
) -> Result<Address, Box<dyn std::error::Error>> {
	match value.map(str::trim).filter(|v| !v.is_empty()) {
		Some(raw) => Ok(raw.parse()?),
		None => Ok(default_value),
	}
}

fn commit_hex_to_bytes32(commit: &str) -> Result<FixedBytes<32>, Box<dyn std::error::Error>> {
	let trimmed = commit.trim();
	let hex = trimmed.strip_prefix("0x").or(trimmed.strip_prefix("0X")).unwrap_or(trimmed);
	if !hex.chars().all(|c| c.is_ascii_hexdigit()) {
		return Err(format!(
			"Invalid commit hash {trimmed}. Expected a hex-encoded Git commit hash."
		)
		.into());
	}

	let canonical = match hex.len() {
		// Git SHA-1 object ids: preserve value and pad left to bytes32.
		40 => format!("{hex:0>64}"),
		// Git SHA-256 object ids (or already canonical bytes32).
		64 => hex.to_string(),
		other => {
			return Err(format!(
				"Unsupported commit hash length {other} for {trimmed}. Expected 40 (SHA-1) or 64 (SHA-256) hex chars."
			)
			.into())
		},
	};

	Ok(format!("0x{canonical}").parse()?)
}

fn assert_repo_id_compatible(
	repo_root: &std::path::Path,
	repo_id: FixedBytes<32>,
) -> Result<(), Box<dyn std::error::Error>> {
	let expected = format!("{:#x}", repo_id);
	match read_repo_id_if_exists(repo_root)? {
		Some(existing) => {
			if !existing.eq_ignore_ascii_case(&expected) {
				return Err(format!(
					"Repo ID mismatch: .crrp/repo-id has {existing} but command resolved {expected}."
				)
				.into());
			}
		},
		None => {},
	}

	Ok(())
}

fn write_repo_id_if_missing(
	repo_root: &std::path::Path,
	repo_id: FixedBytes<32>,
) -> Result<(), Box<dyn std::error::Error>> {
	if read_repo_id_if_exists(repo_root)?.is_none() {
		write_repo_id(repo_root, &format!("{:#x}", repo_id))?;
	}
	Ok(())
}

pub(super) async fn run_fetch(
	args: FetchArgs,
	eth_rpc_url_override: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url_override).await?;
	let into = args
		.into
		.unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

	if ctx.backend == Backend::Mock {
		let state = load_mock_state(&ctx.repo_root)?;
		let repo_state = state
			.repos
			.get(&repo_key(ctx.repo_id))
			.ok_or_else(|| format!("Mock backend: repo {:#x} has no proposals.", ctx.repo_id))?;
		let proposal = repo_state.proposals.get(&args.proposal_id).ok_or_else(|| {
			format!("Mock backend: proposal {} not found for this repo.", args.proposal_id)
		})?;
		let source = ctx.repo_root.join(&proposal.bundle_path);
		if !source.exists() {
			return Err(format!(
				"Mock backend: stored bundle for proposal {} is missing at {}.",
				args.proposal_id,
				source.display()
			)
			.into());
		}

		let destination = resolve_fetch_destination(&into, args.proposal_id, &proposal.commit);
		let destination_dir = destination
			.parent()
			.ok_or_else(|| format!("Invalid fetch destination: {}", destination.display()))?;
		fs::create_dir_all(destination_dir)?;
		fs::copy(&source, &destination)?;

		println!("Fetched proposal {}.", args.proposal_id);
		println!("Repository: {}", ctx.repo_root.display());
		println!("Repo ID: {:#x}", ctx.repo_id);
		println!("Mock CID: {}", proposal.cid);
		println!("Source bundle: {}", source.display());
		println!("Copied to: {}", destination.display());
		return Ok(());
	}

	println!("Fetching proposal {}...", args.proposal_id);
	println!("Repository: {}", ctx.repo_root.display());
	println!("Repo ID: {:#x}", ctx.repo_id);
	println!("Target directory: {}", into.display());
	println!("Skeleton: resolve proposal CID -> download bundle -> import into local Git.");
	Ok(())
}

pub(super) async fn run_review(
	args: ReviewArgs,
	eth_rpc_url_override: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url_override).await?;
	ensure_wallet_session(&ctx, "review submission").await?;
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

pub(super) async fn run_merge(
	args: MergeArgs,
	eth_rpc_url_override: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url_override).await?;
	if !args.dry_run {
		ensure_wallet_session(&ctx, "proposal merge").await?;
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
		let proposal = repo_state.proposals.get_mut(&args.proposal_id).ok_or_else(|| {
			format!("Mock backend: proposal {} not found for this repo.", args.proposal_id)
		})?;
		if proposal.state != MockProposalStatus::Open {
			return Err(format!(
				"Mock backend: proposal {} is not open for merge.",
				args.proposal_id,
			)
			.into());
		}

		proposal.state = MockProposalStatus::Merged;
		let merged_cid = proposal.cid.clone();
		repo_state.head_cid = merged_cid.clone();
		save_mock_state(&ctx.repo_root, &state)?;
		println!(
			"Mock backend: proposal {} marked merged locally. HEAD CID set to {}.",
			args.proposal_id, merged_cid
		);
	}

	Ok(())
}

pub(super) async fn run_release(
	args: ReleaseArgs,
	eth_rpc_url_override: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url_override).await?;
	if !args.dry_run {
		ensure_wallet_session(&ctx, "release creation").await?;
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

pub(super) async fn run_status(
	args: StatusArgs,
	eth_rpc_url_override: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url_override).await?;
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

pub(super) async fn run_repo(
	args: RepoArgs,
	eth_rpc_url_override: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url_override).await?;
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

pub(super) async fn run_proposals(
	args: ProposalsArgs,
	eth_rpc_url_override: Option<&str>,
) -> Result<(), Box<dyn std::error::Error>> {
	let ctx = preflight(&args.common, eth_rpc_url_override).await?;

	if ctx.backend == Backend::Mock {
		let state = load_mock_state(&ctx.repo_root)?;
		let repo_state = state.repos.get(&repo_key(ctx.repo_id)).cloned().unwrap_or_default();
		let mut printed = 0u16;

		println!("CRRP Proposals (mock)");
		println!("Repository: {}", ctx.repo_root.display());
		println!("Repo ID: {:#x}", ctx.repo_id);
		println!("State filter: {:?}", args.state);
		println!("Limit: {}", args.limit);

		for (proposal_id, proposal) in &repo_state.proposals {
			if printed >= args.limit {
				break;
			}
			if !proposal_matches_filter(proposal.state, args.state) {
				continue;
			}

			println!(
				"[{}] state={} commit={} cid={}",
				proposal_id,
				mock_proposal_status_label(proposal.state),
				proposal.commit,
				proposal.cid
			);
			printed += 1;
		}

		if printed == 0 {
			println!("No proposals matched the current filter.");
		}
		return Ok(());
	}

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
