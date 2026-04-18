use clap::{Parser, Subcommand};
use std::{path::PathBuf, process::Command};

mod commands;

const DEFAULT_SUBSTRATE_RPC_WS: &str = "ws://127.0.0.1:9944";

#[derive(Parser)]
#[command(name = "crrp")]
#[command(about = "CRRP CLI skeleton for proposal/review/merge/release workflows")]
struct Cli {
	/// WebSocket RPC endpoint URL (defaults to ws://127.0.0.1:9944).
	#[arg(long, env = "SUBSTRATE_RPC_WS")]
	url: Option<String>,

	/// Ethereum JSON-RPC endpoint URL (defaults to http://127.0.0.1:8545).
	#[arg(long, env = "ETH_RPC_HTTP")]
	eth_rpc_url: Option<String>,

	#[command(subcommand)]
	command: Commands,
}

#[derive(Subcommand)]
enum Commands {
	/// Configure CRRP repository settings
	Config {
		#[command(subcommand)]
		action: commands::config::ConfigAction,
	},
	/// Create/register a repository in the CRRP registry
	CreateRepo(commands::crrp::CreateRepoArgs),
	/// Submit a proposal (skeleton)
	Propose(commands::crrp::ProposeArgs),
	/// Fetch proposal artifact and import to local Git (skeleton)
	Fetch(commands::crrp::FetchArgs),
	/// Submit proposal review decision (skeleton)
	Review(commands::crrp::ReviewArgs),
	/// Merge proposal and set canonical HEAD (skeleton)
	Merge(commands::crrp::MergeArgs),
	/// Create a release from canonical commit (skeleton)
	Release(commands::crrp::ReleaseArgs),
	/// Show CRRP status for current repository (skeleton)
	Status(commands::crrp::StatusArgs),
	/// Show CRRP repository metadata (skeleton)
	Repo(commands::crrp::RepoArgs),
	/// List proposals (skeleton)
	Proposals(commands::crrp::ProposalsArgs),
	/// Chain information commands
	Chain {
		#[command(subcommand)]
		action: commands::chain::ChainAction,
	},
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
	let cli = Cli::parse();

	match cli.command {
		Commands::Config { action } => commands::config::run(action)?,
		Commands::CreateRepo(args) => {
			commands::crrp::run(
				commands::crrp::CrrpAction::CreateRepo(args),
				cli.eth_rpc_url.as_deref(),
			)
			.await?
		},
		Commands::Propose(args) => {
			commands::crrp::run(
				commands::crrp::CrrpAction::Propose(args),
				cli.eth_rpc_url.as_deref(),
			)
			.await?
		},
		Commands::Fetch(args) => {
			commands::crrp::run(commands::crrp::CrrpAction::Fetch(args), cli.eth_rpc_url.as_deref())
				.await?
		},
		Commands::Review(args) => {
			commands::crrp::run(
				commands::crrp::CrrpAction::Review(args),
				cli.eth_rpc_url.as_deref(),
			)
			.await?
		},
		Commands::Merge(args) => {
			commands::crrp::run(commands::crrp::CrrpAction::Merge(args), cli.eth_rpc_url.as_deref())
				.await?
		},
		Commands::Release(args) => {
			commands::crrp::run(
				commands::crrp::CrrpAction::Release(args),
				cli.eth_rpc_url.as_deref(),
			)
			.await?
		},
		Commands::Status(args) => {
			commands::crrp::run(
				commands::crrp::CrrpAction::Status(args),
				cli.eth_rpc_url.as_deref(),
			)
			.await?
		},
		Commands::Repo(args) => {
			commands::crrp::run(commands::crrp::CrrpAction::Repo(args), cli.eth_rpc_url.as_deref())
				.await?
		},
		Commands::Proposals(args) => {
			commands::crrp::run(
				commands::crrp::CrrpAction::Proposals(args),
				cli.eth_rpc_url.as_deref(),
			)
			.await?
		},
		Commands::Chain { action } => {
			let ws_url = resolve_chain_ws_url(cli.url.as_deref());
			commands::chain::run(action, &ws_url).await?
		},
	}

	Ok(())
}

fn resolve_chain_ws_url(cli_override: Option<&str>) -> String {
	if let Some(url) = cli_override {
		return url.to_string();
	}

	if let Some(repo_root) = detect_repo_root_if_available() {
		if let Ok(config) = commands::config::load_repo_config(&repo_root) {
			if let Some(url) = config.substrate_rpc_ws {
				if !url.trim().is_empty() {
					return url;
				}
			}
		}
	}

	DEFAULT_SUBSTRATE_RPC_WS.to_string()
}

fn detect_repo_root_if_available() -> Option<PathBuf> {
	let cwd = std::env::current_dir().ok()?;
	let output = Command::new("git")
		.arg("rev-parse")
		.arg("--show-toplevel")
		.current_dir(cwd)
		.output()
		.ok()?;
	if !output.status.success() {
		return None;
	}

	let repo = String::from_utf8(output.stdout).ok()?;
	let trimmed = repo.trim();
	if trimmed.is_empty() {
		None
	} else {
		Some(PathBuf::from(trimmed))
	}
}
