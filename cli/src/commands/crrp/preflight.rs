use alloy::{
	primitives::{keccak256, Address, FixedBytes},
	providers::ProviderBuilder,
	sol,
};
use serde::Deserialize;
use std::{
	fs,
	path::{Path, PathBuf},
};

use crate::commands::config::{
	load_repo_config, read_repo_id_if_exists, read_repo_slug_if_exists, repo_slug_path, RepoConfig,
	RepoSlug,
};

use super::{
	args::{CrrpCommonArgs, WalletBackend},
	git::{detect_repo_root, git_output},
	mock::{load_mock_state, repo_key},
	model::{Backend, CrrpContext},
};

pub(super) const DEFAULT_ETH_RPC_HTTP: &str = "http://127.0.0.1:8545";
const DEFAULT_SUBSTRATE_RPC_WS: &str = "ws://127.0.0.1:9944";

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

#[derive(Deserialize)]
struct Deployments {
	evm: Option<String>,
}

#[derive(Clone)]
pub(super) struct ResolvedRepoIdentity {
	pub organization: String,
	pub repository: String,
	pub repo_id: FixedBytes<32>,
}

pub(super) async fn preflight(
	common: &CrrpCommonArgs,
	eth_rpc_url_override: Option<&str>,
) -> Result<CrrpContext, Box<dyn std::error::Error>> {
	let repo_root = detect_repo_root(common.repo.as_deref())?;
	let repo_config = load_repo_config(&repo_root)?;
	let branch = git_output(&repo_root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
	let allow_non_main = common.allow_non_main || repo_config.allow_non_main;
	if branch != "main" && !allow_non_main {
		return Err(format!(
			"CRRP only supports main branch. Current branch: {branch}. Use --allow-non-main or set allowNonMain=true in .crrp/config.json for testing."
		)
		.into());
	}

	let repo = resolve_repo_identity(
		common.organization.as_deref(),
		common.repository.as_deref(),
		common.repo_id.as_deref(),
		&repo_root,
	)?;
	let wallet_backend = resolve_wallet_backend(common.wallet_backend, &repo_config)?;
	let papp_term_metadata = common
		.papp_term_metadata
		.clone()
		.or_else(|| repo_config.papp_term_metadata.clone());
	let papp_term_endpoint = common
		.papp_term_endpoint
		.clone()
		.or_else(|| repo_config.papp_term_endpoint.clone());
	let eth_rpc_url = resolve_eth_rpc_url(eth_rpc_url_override, &repo_config);
	let substrate_rpc_ws = repo_config
		.substrate_rpc_ws
		.clone()
		.unwrap_or_else(|| DEFAULT_SUBSTRATE_RPC_WS.to_string());

	if common.mock {
		let state = load_mock_state(&repo_root)?;
		let repo_state = state.repos.get(&repo_key(repo.repo_id)).cloned().unwrap_or_default();
		let registry = match common.registry.as_deref().or(repo_config.registry.as_deref()) {
			Some(addr) => addr.parse()?,
			None => Address::ZERO,
		};

		return Ok(CrrpContext {
			backend: Backend::Mock,
			repo_root,
			organization: repo.organization,
			repository: repo.repository,
			repo_id: repo.repo_id,
			substrate_rpc_ws,
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
			wallet_backend,
			papp_term_metadata,
			papp_term_endpoint,
		});
	}

	let registry = resolve_registry_address(
		common.registry.as_deref(),
		repo_config.registry.as_deref(),
		&repo_root,
	)?;

	let provider = ProviderBuilder::new().connect_http(eth_rpc_url.parse()?);
	let contract = CRRPRepositoryRegistry::new(registry, &provider);
	let repo_data = contract.getRepo(repo.repo_id).call().await.map_err(|error| {
		format!("Repo is not registered on CRRP registry (or RPC unavailable): {error}")
	})?;

	Ok(CrrpContext {
		backend: Backend::Rpc,
		repo_root,
		organization: repo.organization,
		repository: repo.repository,
		repo_id: repo.repo_id,
		substrate_rpc_ws,
		registry,
		maintainer: repo_data.maintainer,
		head_commit: repo_data.headCommit,
		head_cid: repo_data.headCid,
		proposal_count: repo_data.proposalCount.to_string(),
		release_count: repo_data.releaseCount.to_string(),
		wallet_backend,
		papp_term_metadata,
		papp_term_endpoint,
	})
}

pub(super) fn resolve_wallet_backend(
	override_backend: Option<WalletBackend>,
	repo_config: &RepoConfig,
) -> Result<WalletBackend, Box<dyn std::error::Error>> {
	if let Some(backend) = override_backend {
		return Ok(backend);
	}

	if let Some(value) = repo_config.wallet_backend.as_deref() {
		return parse_wallet_backend(value);
	}

	Ok(WalletBackend::Papp)
}

fn parse_wallet_backend(value: &str) -> Result<WalletBackend, Box<dyn std::error::Error>> {
	match value.trim().to_lowercase().as_str() {
		"mock" => Ok(WalletBackend::Mock),
		"papp" | "pwallet" => Ok(WalletBackend::Papp),
		other => Err(format!("Invalid wallet_backend in .crrp/config.json: {other}").into()),
	}
}

pub(super) fn derive_repo_id(organization: &str, repository: &str) -> FixedBytes<32> {
	let slug = format!("{organization}/{repository}");
	FixedBytes::from(keccak256(slug.as_bytes()))
}

pub(super) fn resolve_repo_identity(
	organization_override: Option<&str>,
	repository_override: Option<&str>,
	repo_id_override: Option<&str>,
	repo_root: &Path,
) -> Result<ResolvedRepoIdentity, Box<dyn std::error::Error>> {
	let repo_slug = resolve_repo_slug(organization_override, repository_override, repo_root)?;

	if let Some(repo_id) = repo_id_override {
		return Ok(ResolvedRepoIdentity {
			organization: repo_slug.organization,
			repository: repo_slug.repository,
			repo_id: repo_id.parse()?,
		});
	}

	Ok(ResolvedRepoIdentity {
		repo_id: derive_repo_id(&repo_slug.organization, &repo_slug.repository),
		organization: repo_slug.organization,
		repository: repo_slug.repository,
	})
}

fn resolve_repo_slug(
	organization_override: Option<&str>,
	repository_override: Option<&str>,
	repo_root: &Path,
) -> Result<RepoSlug, Box<dyn std::error::Error>> {
	let mut repo_slug = read_repo_slug_if_exists(repo_root)?.unwrap_or_default();

	if let Some(organization) =
		organization_override.map(str::trim).filter(|candidate| !candidate.is_empty())
	{
		repo_slug.organization = organization.to_string();
	}

	if let Some(repository) =
		repository_override.map(str::trim).filter(|candidate| !candidate.is_empty())
	{
		repo_slug.repository = repository.to_string();
	}

	if !repo_slug.organization.is_empty() && !repo_slug.repository.is_empty() {
		return Ok(repo_slug);
	}

	if read_repo_id_if_exists(repo_root)?.is_some() {
		return Err(
			"Legacy .crrp/repo-id found without repository slug. Set .crrp/repo-slug.json or pass --organization and --repository."
				.into(),
		);
	}

	Err(format!(
		"Missing repository slug config. Expected {} or pass --organization <org> --repository <name>.",
		repo_slug_path(repo_root).display()
	)
	.into())
}

pub(super) fn resolve_registry_address(
	registry_override: Option<&str>,
	config_registry: Option<&str>,
	repo_root: &Path,
) -> Result<Address, Box<dyn std::error::Error>> {
	if let Some(addr) = registry_override {
		return Ok(addr.parse()?);
	}

	if let Some(addr) = config_registry {
		if !addr.trim().is_empty() {
			return Ok(addr.parse()?);
		}
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

pub(super) fn resolve_eth_rpc_url(override_url: Option<&str>, repo_config: &RepoConfig) -> String {
	override_url
		.map(str::to_string)
		.or_else(|| repo_config.eth_rpc_http.clone())
		.unwrap_or_else(|| DEFAULT_ETH_RPC_HTTP.to_string())
}
