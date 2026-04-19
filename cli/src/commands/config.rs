use clap::{Args, Subcommand, ValueEnum};
use serde::{Deserialize, Serialize};
use std::{
	fs,
	io::{self, Write},
	path::{Path, PathBuf},
	process::Command,
};

#[derive(Subcommand)]
pub enum ConfigAction {
	/// Initialize or update repository CRRP config (interactive or flag-driven)
	Init(ConfigInitArgs),
	/// Show current repository CRRP config
	Show(ConfigShowArgs),
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, ValueEnum)]
pub enum ConfigWalletBackend {
	Mock,
	#[value(alias = "pwallet")]
	Papp,
}

#[derive(Args)]
pub struct ConfigInitArgs {
	/// Optional repository path (defaults to current directory).
	#[arg(long)]
	pub repo: Option<PathBuf>,
	/// Prompt interactively for missing values.
	#[arg(long, default_value_t = false)]
	pub interactive: bool,
	/// Repository organization slug used to derive the CRRP repo id.
	#[arg(long)]
	pub organization: Option<String>,
	/// Repository name slug used to derive the CRRP repo id.
	#[arg(long)]
	pub repository: Option<String>,
	/// Default registry contract address.
	#[arg(long)]
	pub registry: Option<String>,
	/// Default Substrate WS RPC endpoint URL.
	#[arg(long)]
	pub substrate_rpc_ws: Option<String>,
	/// Default Ethereum JSON-RPC endpoint URL.
	#[arg(long)]
	pub eth_rpc_http: Option<String>,
	/// Default wallet backend.
	#[arg(long, value_enum)]
	pub wallet_backend: Option<ConfigWalletBackend>,
	/// Default papp-term metadata URL.
	#[arg(long)]
	pub papp_term_metadata: Option<String>,
	/// Default statement-store endpoint passed to papp-term.
	#[arg(long)]
	pub papp_term_endpoint: Option<String>,
	/// Allow running CRRP commands outside main (testing only).
	#[arg(long)]
	pub allow_non_main: Option<bool>,
}

#[derive(Args)]
pub struct ConfigShowArgs {
	/// Optional repository path (defaults to current directory).
	#[arg(long)]
	pub repo: Option<PathBuf>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoConfig {
	#[serde(default)]
	pub substrate_rpc_ws: Option<String>,
	#[serde(default)]
	pub eth_rpc_http: Option<String>,
	#[serde(default)]
	pub registry: Option<String>,
	#[serde(default)]
	pub wallet_backend: Option<String>,
	#[serde(default)]
	pub papp_term_metadata: Option<String>,
	#[serde(default)]
	pub papp_term_endpoint: Option<String>,
	#[serde(default)]
	pub allow_non_main: bool,
}

pub fn run(action: ConfigAction) -> Result<(), Box<dyn std::error::Error>> {
	match action {
		ConfigAction::Init(args) => run_init(args)?,
		ConfigAction::Show(args) => run_show(args)?,
	}
	Ok(())
}

pub fn repo_config_path(repo_root: &Path) -> PathBuf {
	repo_root.join(".crrp").join("config.json")
}

pub fn repo_id_path(repo_root: &Path) -> PathBuf {
	repo_root.join(".crrp").join("repo-id")
}

pub fn repo_slug_path(repo_root: &Path) -> PathBuf {
	repo_root.join(".crrp").join("repo-slug.json")
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, Eq, PartialEq)]
pub struct RepoSlug {
	pub organization: String,
	pub repository: String,
}

pub fn load_repo_config(repo_root: &Path) -> Result<RepoConfig, Box<dyn std::error::Error>> {
	let path = repo_config_path(repo_root);
	if !path.exists() {
		return Ok(RepoConfig::default());
	}
	let raw = fs::read_to_string(path)?;
	Ok(serde_json::from_str(&raw)?)
}

pub fn save_repo_config(
	repo_root: &Path,
	config: &RepoConfig,
) -> Result<(), Box<dyn std::error::Error>> {
	let crrp_dir = repo_root.join(".crrp");
	fs::create_dir_all(&crrp_dir)?;
	let path = repo_config_path(repo_root);
	fs::write(path, serde_json::to_string_pretty(config)? + "\n")?;
	Ok(())
}

pub fn read_repo_id_if_exists(
	repo_root: &Path,
) -> Result<Option<String>, Box<dyn std::error::Error>> {
	let path = repo_id_path(repo_root);
	if !path.exists() {
		return Ok(None);
	}
	let raw = fs::read_to_string(path)?;
	let trimmed = raw.trim();
	if trimmed.is_empty() {
		return Ok(None);
	}
	Ok(Some(trimmed.to_string()))
}

pub fn write_repo_id(repo_root: &Path, repo_id: &str) -> Result<(), Box<dyn std::error::Error>> {
	let crrp_dir = repo_root.join(".crrp");
	fs::create_dir_all(&crrp_dir)?;
	let path = repo_id_path(repo_root);
	fs::write(path, format!("{}\n", repo_id.trim()))?;
	Ok(())
}

pub fn read_repo_slug_if_exists(
	repo_root: &Path,
) -> Result<Option<RepoSlug>, Box<dyn std::error::Error>> {
	let path = repo_slug_path(repo_root);
	if !path.exists() {
		return Ok(None);
	}

	let raw = fs::read_to_string(path)?;
	let slug: RepoSlug = serde_json::from_str(&raw)?;
	if slug.organization.trim().is_empty() || slug.repository.trim().is_empty() {
		return Ok(None);
	}

	Ok(Some(RepoSlug {
		organization: slug.organization.trim().to_string(),
		repository: slug.repository.trim().to_string(),
	}))
}

pub fn write_repo_slug(
	repo_root: &Path,
	repo_slug: &RepoSlug,
) -> Result<(), Box<dyn std::error::Error>> {
	let crrp_dir = repo_root.join(".crrp");
	fs::create_dir_all(&crrp_dir)?;
	let path = repo_slug_path(repo_root);
	fs::write(path, serde_json::to_string_pretty(repo_slug)? + "\n")?;
	Ok(())
}

fn run_init(args: ConfigInitArgs) -> Result<(), Box<dyn std::error::Error>> {
	let repo_root = detect_repo_root(args.repo.as_deref())?;
	let mut config = load_repo_config(&repo_root)?;
	let mut repo_slug = read_repo_slug_if_exists(&repo_root)?;

	if let Some(value) = normalize_optional(args.registry) {
		config.registry = Some(value);
	}
	if let Some(value) = normalize_optional(args.substrate_rpc_ws) {
		config.substrate_rpc_ws = Some(value);
	}
	if let Some(value) = normalize_optional(args.eth_rpc_http) {
		config.eth_rpc_http = Some(value);
	}
	if let Some(value) = args.wallet_backend {
		config.wallet_backend = Some(value_to_wallet_backend(value).to_string());
	}
	if let Some(value) = normalize_optional(args.papp_term_metadata) {
		config.papp_term_metadata = Some(value);
	}
	if let Some(value) = normalize_optional(args.papp_term_endpoint) {
		config.papp_term_endpoint = Some(value);
	}
	if let Some(value) = args.allow_non_main {
		config.allow_non_main = value;
	}
	if let Some(value) = normalize_optional(args.organization) {
		let mut slug = repo_slug.unwrap_or_default();
		slug.organization = value;
		repo_slug = Some(slug);
	}
	if let Some(value) = normalize_optional(args.repository) {
		let mut slug = repo_slug.unwrap_or_default();
		slug.repository = value;
		repo_slug = Some(slug);
	}

	if args.interactive {
		let current_organization = repo_slug.as_ref().map(|slug| slug.organization.as_str());
		let current_repository = repo_slug.as_ref().map(|slug| slug.repository.as_str());
		let organization = prompt_optional("Repository organization", current_organization)?;
		let repository = prompt_optional("Repository name", current_repository)?;
		repo_slug = match (organization, repository) {
			(Some(organization), Some(repository)) => Some(RepoSlug { organization, repository }),
			_ => None,
		};
		config.registry = prompt_optional("Registry address", config.registry.as_deref())?;
		config.substrate_rpc_ws =
			prompt_optional("Default Substrate RPC URL", config.substrate_rpc_ws.as_deref())?;
		config.eth_rpc_http =
			prompt_optional("Default Ethereum RPC URL", config.eth_rpc_http.as_deref())?;

		let wallet_backend_default = config.wallet_backend.as_deref().unwrap_or("papp");
		let wallet_backend =
			prompt_string("Default wallet backend [mock|papp]", Some(wallet_backend_default))?;
		let normalized_backend = normalize_optional(Some(wallet_backend)).unwrap_or_default();
		if !normalized_backend.is_empty() {
			config.wallet_backend = Some(normalized_backend);
		}

		config.papp_term_metadata = prompt_optional(
			"Default papp-term metadata URL",
			config.papp_term_metadata.as_deref(),
		)?;
		config.papp_term_endpoint =
			prompt_optional("Default papp-term endpoint", config.papp_term_endpoint.as_deref())?;

		config.allow_non_main =
			prompt_bool("Allow non-main branch for CRRP commands", config.allow_non_main)?;
	}

	save_repo_config(&repo_root, &config)?;
	if let Some(value) = repo_slug.as_ref() {
		write_repo_slug(&repo_root, value)?;
	}

	println!("CRRP configuration updated.");
	println!("Repo root: {}", repo_root.display());
	println!("Config file: {}", repo_config_path(&repo_root).display());
	println!("Repo slug file: {}", repo_slug_path(&repo_root).display());
	if let Some(slug) = repo_slug {
		println!("Repository slug: {}/{}", slug.organization, slug.repository);
	}
	println!(
		"allow_non_main: {}",
		if config.allow_non_main { "true (testing enabled)" } else { "false" }
	);

	Ok(())
}

fn run_show(args: ConfigShowArgs) -> Result<(), Box<dyn std::error::Error>> {
	let repo_root = detect_repo_root(args.repo.as_deref())?;
	let config = load_repo_config(&repo_root)?;
	let repo_slug = read_repo_slug_if_exists(&repo_root)?;
	let repo_id = read_repo_id_if_exists(&repo_root)?;
	let formatted = serde_json::to_string_pretty(&config)?;

	println!("Repo root: {}", repo_root.display());
	println!(
		"Repository slug: {}",
		repo_slug
			.map(|slug| format!("{}/{}", slug.organization, slug.repository))
			.unwrap_or_else(|| "<not set>".to_string())
	);
	println!("Derived Repo ID: {}", repo_id.unwrap_or_else(|| "<not set>".to_string()));
	println!("Config file: {}", repo_config_path(&repo_root).display());
	println!("{formatted}");

	Ok(())
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

fn normalize_optional(value: Option<String>) -> Option<String> {
	let value = value?;
	let trimmed = value.trim();
	if trimmed.is_empty() {
		None
	} else {
		Some(trimmed.to_string())
	}
}

fn prompt_optional(
	label: &str,
	current: Option<&str>,
) -> Result<Option<String>, Box<dyn std::error::Error>> {
	let input = prompt_string(label, current)?;
	Ok(normalize_optional(Some(input)))
}

fn prompt_string(label: &str, current: Option<&str>) -> Result<String, Box<dyn std::error::Error>> {
	match current {
		Some(default) => {
			print!("{label} [{default}]: ");
		},
		None => {
			print!("{label}: ");
		},
	}
	io::stdout().flush()?;

	let mut input = String::new();
	io::stdin().read_line(&mut input)?;
	let trimmed = input.trim().to_string();
	if trimmed.is_empty() {
		Ok(current.unwrap_or("").to_string())
	} else {
		Ok(trimmed)
	}
}

fn prompt_bool(label: &str, current: bool) -> Result<bool, Box<dyn std::error::Error>> {
	loop {
		let default_marker = if current { "Y/n" } else { "y/N" };
		print!("{label} [{default_marker}]: ");
		io::stdout().flush()?;

		let mut input = String::new();
		io::stdin().read_line(&mut input)?;
		let trimmed = input.trim().to_lowercase();

		if trimmed.is_empty() {
			return Ok(current);
		}
		if ["y", "yes", "true", "1"].contains(&trimmed.as_str()) {
			return Ok(true);
		}
		if ["n", "no", "false", "0"].contains(&trimmed.as_str()) {
			return Ok(false);
		}
		println!("Please answer yes or no.");
	}
}

fn value_to_wallet_backend(value: ConfigWalletBackend) -> &'static str {
	match value {
		ConfigWalletBackend::Mock => "mock",
		ConfigWalletBackend::Papp => "papp",
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::{
		sync::atomic::{AtomicU64, Ordering},
		time::{SystemTime, UNIX_EPOCH},
	};

	static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(0);

	struct TempDir {
		path: PathBuf,
	}

	impl TempDir {
		fn new() -> Result<Self, Box<dyn std::error::Error>> {
			let nanos = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
			let serial = NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed);
			let path = std::env::temp_dir()
				.join(format!("crrp-config-test-{}-{nanos}-{serial}", std::process::id()));
			fs::create_dir_all(&path)?;
			Ok(Self { path })
		}
	}

	impl Drop for TempDir {
		fn drop(&mut self) {
			let _ = fs::remove_dir_all(&self.path);
		}
	}

	#[test]
	fn repo_config_roundtrip() -> Result<(), Box<dyn std::error::Error>> {
		let repo = TempDir::new()?;
		let expected = RepoConfig {
			substrate_rpc_ws: Some("ws://127.0.0.1:9944".to_string()),
			eth_rpc_http: Some("http://127.0.0.1:8545".to_string()),
			registry: Some("0x0000000000000000000000000000000000000001".to_string()),
			wallet_backend: Some("mock".to_string()),
			papp_term_metadata: Some("https://example.com/metadata.json".to_string()),
			papp_term_endpoint: Some("wss://example.com/people".to_string()),
			allow_non_main: true,
		};

		save_repo_config(&repo.path, &expected)?;
		let actual = load_repo_config(&repo.path)?;

		assert_eq!(actual.substrate_rpc_ws, expected.substrate_rpc_ws);
		assert_eq!(actual.eth_rpc_http, expected.eth_rpc_http);
		assert_eq!(actual.registry, expected.registry);
		assert_eq!(actual.wallet_backend, expected.wallet_backend);
		assert_eq!(actual.papp_term_metadata, expected.papp_term_metadata);
		assert_eq!(actual.papp_term_endpoint, expected.papp_term_endpoint);
		assert_eq!(actual.allow_non_main, expected.allow_non_main);

		Ok(())
	}

	#[test]
	fn repo_slug_roundtrip() -> Result<(), Box<dyn std::error::Error>> {
		let repo = TempDir::new()?;
		let repo_slug = RepoSlug {
			organization: "openai".to_string(),
			repository: "crrp".to_string(),
		};

		write_repo_slug(&repo.path, &repo_slug)?;
		let restored = read_repo_slug_if_exists(&repo.path)?;

		assert_eq!(restored, Some(repo_slug));
		Ok(())
	}
}
