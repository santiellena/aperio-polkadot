use std::path::Path;

use alloy::{
	network::EthereumWallet,
	primitives::{Address, FixedBytes},
	providers::ProviderBuilder,
	signers::local::PrivateKeySigner,
	sol,
};

use crate::commands::config::{
	load_repo_config, read_repo_slug_if_exists, write_repo_id, write_repo_slug, RepoSlug,
};

use super::{
	super::{
		args::CreateRepoArgs,
		git::{detect_repo_root, git_output},
		mock::{load_mock_state, repo_key, save_mock_state},
		model::{Backend, CrrpContext, MockRepoState},
		preflight::{
			resolve_eth_rpc_url, resolve_registry_address, resolve_repo_identity,
			resolve_wallet_backend,
		},
		wallet::request_wallet_tx_approval,
	},
	output::{kv, line},
	CrrpResult,
};

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
		function createRepo(
			string calldata organization,
			string calldata repository,
			bytes32 initialHeadCommit,
			string calldata initialHeadCid
		) external;
		function setContributorRole(bytes32 repoId, address account, bool enabled) external;
		function setReviewerRole(bytes32 repoId, address account, bool enabled) external;
	}
}

pub(crate) async fn run_create_repo(
	args: CreateRepoArgs,
	eth_rpc_url_override: Option<&str>,
) -> CrrpResult {
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

	let repo = resolve_repo_identity(
		args.common.organization.as_deref(),
		args.common.repository.as_deref(),
		args.common.repo_id.as_deref(),
		&repo_root,
	)?;
	assert_repo_slug_compatible(&repo_root, &repo.organization, &repo.repository)?;
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
		args.initial_commit.as_deref().map(str::trim).filter(|value| !value.is_empty());
	let resolved_commit =
		git_output(&repo_root, &["rev-parse", "--verify", initial_commit_ref.unwrap_or("HEAD")])?;
	let initial_head_commit = commit_hex_to_bytes32(&resolved_commit)?;
	let initial_head_cid = args.initial_cid.trim();
	if initial_head_cid.is_empty() {
		return Err("--initial-cid cannot be empty".into());
	}

	if args.common.mock {
		let mut state = load_mock_state(&repo_root)?;
		let key = repo_key(repo.repo_id);
		if state.repos.contains_key(&key) {
			return Err(format!("Mock backend: repo {:#x} already exists.", repo.repo_id).into());
		}
		state.repos.insert(
			key,
			MockRepoState { head_cid: initial_head_cid.to_string(), ..MockRepoState::default() },
		);
		save_mock_state(&repo_root, &state)?;
		write_repo_identity(&repo_root, &repo.organization, &repo.repository, repo.repo_id)?;

		line("Mock backend: repository created.");
		kv("Repository", repo_root.display());
		kv("Repository slug", format!("{}/{}", repo.organization, repo.repository));
		kv("Repo ID", format!("{:#x}", repo.repo_id));
		kv("Initial HEAD", resolved_commit);
		kv("Initial CID", initial_head_cid);
		return Ok(());
	}

	let signer = resolve_evm_signer(&args.signer)?;
	let signer_address = signer.address();
	let contributor = resolve_optional_address(args.contributor.as_deref(), signer_address)?;
	let reviewer = resolve_optional_address(args.reviewer.as_deref(), contributor)?;
	if !args.skip_role_grants {
		if contributor == Address::ZERO {
			return Err("Contributor address cannot be zero when role grants are enabled.".into());
		}
		if reviewer == Address::ZERO {
			return Err("Reviewer address cannot be zero when role grants are enabled.".into());
		}
	}

	let registry = resolve_registry_address(
		args.common.registry.as_deref(),
		repo_config.registry.as_deref(),
		&repo_root,
	)?;
	let wallet_ctx = CrrpContext {
		backend: Backend::Rpc,
		repo_root: repo_root.clone(),
		organization: repo.organization.clone(),
		repository: repo.repository.clone(),
		repo_id: repo.repo_id,
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
	let approval = request_wallet_tx_approval(
		&wallet_ctx,
		"CRRP create-repo signature request",
		&format!(
			"repo={}/{}, repo_id={:#x}, registry={}, initial_head={}, initial_cid={}, signer={}",
			repo.organization,
			repo.repository,
			repo.repo_id,
			registry,
			resolved_commit,
			initial_head_cid,
			signer_address
		),
	)
	.await?;

	if args.transport_only {
		line("Transport-only test completed.");
		kv("Repository", repo_root.display());
		kv("Repository slug", format!("{}/{}", repo.organization, repo.repository));
		kv("Repo ID", format!("{:#x}", repo.repo_id));
		kv("Registry", registry);
		kv("Initial HEAD", resolved_commit);
		kv("Initial CID", initial_head_cid);
		if let Some(session_id) = approval.session_id.as_deref() {
			kv("Wallet session", session_id);
		}
		kv("Wallet approval id", approval.approval_id);
		kv("Wallet approval timestamp", approval.approved_at_unix_secs);
		kv("Wallet payload digest", approval.payload_digest_hex);
		kv("Wallet signature", approval.signature_hex);
		kv("Wallet signature origin", approval.signature_origin.as_str());
		kv("Wallet signature receipt", approval.receipt_path.display());
		line("EVM registry reads/writes were skipped because --transport-only was enabled.");
		return Ok(());
	}

	let eth_rpc_url = resolve_eth_rpc_url(eth_rpc_url_override, &repo_config);
	let wallet = EthereumWallet::from(signer);
	let provider = ProviderBuilder::new().wallet(wallet).connect_http(eth_rpc_url.parse()?);
	let registry_contract = CRRPRepositoryRegistryWrite::new(registry, &provider);
	match registry_contract.getRepo(repo.repo_id).call().await {
		Ok(existing_repo) => {
			return Err(format!(
				"Repo already exists on registry (maintainer {}). Use a different repository slug or continue with this repo.",
				existing_repo.maintainer
			)
			.into())
		},
		Err(error) => {
			let message = error.to_string();
			if !message.contains("Repo not found") {
				return Err(
					format!("Failed to verify repo existence before create-repo: {error}").into()
				);
			}
		},
	}

	let create_receipt = registry_contract
		.createRepo(
			repo.organization.clone(),
			repo.repository.clone(),
			initial_head_commit,
			initial_head_cid.to_string(),
		)
		.send()
		.await?
		.get_receipt()
		.await?;

	line("Repository created on-chain.");
	kv("Repository", repo_root.display());
	kv("Repository slug", format!("{}/{}", repo.organization, repo.repository));
	kv("Repo ID", format!("{:#x}", repo.repo_id));
	kv("Registry", registry);
	kv("Signer", signer_address);
	kv("Initial HEAD", resolved_commit);
	kv("Initial CID", initial_head_cid);
	kv("createRepo tx", create_receipt.transaction_hash);
	if let Some(session_id) = approval.session_id.as_deref() {
		kv("Wallet session", session_id);
	}
	kv("Wallet approval id", approval.approval_id);
	kv("Wallet approval timestamp", approval.approved_at_unix_secs);
	kv("Wallet payload digest", approval.payload_digest_hex);
	kv("Wallet signature", approval.signature_hex);
	kv("Wallet signature origin", approval.signature_origin.as_str());
	kv("Wallet signature receipt", approval.receipt_path.display());
	line("Note: createRepo tx submission still uses --signer; pwallet signing submission is pending.");

	if !args.skip_role_grants {
		let contributor_receipt = registry_contract
			.setContributorRole(repo.repo_id, contributor, true)
			.send()
			.await
			.map_err(|error| {
				format!("Failed to submit setContributorRole tx for {contributor}: {error}")
			})?
			.get_receipt()
			.await
			.map_err(|error| {
				format!(
					"Contributor role tx for {contributor} was submitted but receipt retrieval failed: {error}"
				)
			})?;
		let reviewer_receipt = registry_contract
			.setReviewerRole(repo.repo_id, reviewer, true)
			.send()
			.await
			.map_err(|error| {
				format!("Failed to submit setReviewerRole tx for {reviewer}: {error}")
			})?
			.get_receipt()
			.await
			.map_err(|error| {
				format!(
					"Reviewer role tx for {reviewer} was submitted but receipt retrieval failed: {error}"
				)
			})?;
		line(format!(
			"Contributor role granted to {} (tx {}).",
			contributor, contributor_receipt.transaction_hash
		));
		line(format!(
			"Reviewer role granted to {} (tx {}).",
			reviewer, reviewer_receipt.transaction_hash
		));
	}

	write_repo_identity(&repo_root, &repo.organization, &repo.repository, repo.repo_id)?;
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
	match value.map(str::trim).filter(|candidate| !candidate.is_empty()) {
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
		40 => format!("{hex:0>64}"),
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

fn assert_repo_slug_compatible(repo_root: &Path, organization: &str, repository: &str) -> CrrpResult {
	if let Some(existing) = read_repo_slug_if_exists(repo_root)? {
		if existing.organization != organization || existing.repository != repository {
			return Err(format!(
				"Repository slug mismatch: .crrp/repo-slug.json has {}/{} but command resolved {}/{}.",
				existing.organization, existing.repository, organization, repository
			)
			.into());
		}
	}

	Ok(())
}

fn write_repo_identity(
	repo_root: &Path,
	organization: &str,
	repository: &str,
	repo_id: FixedBytes<32>,
) -> CrrpResult {
	write_repo_slug(
		repo_root,
		&RepoSlug { organization: organization.to_string(), repository: repository.to_string() },
	)?;
	write_repo_id(repo_root, &format!("{:#x}", repo_id))?;
	Ok(())
}
