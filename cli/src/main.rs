use clap::{Parser, Subcommand};

mod commands;

#[derive(Parser)]
#[command(name = "crrp")]
#[command(about = "CRRP CLI skeleton for proposal/review/merge/release workflows")]
struct Cli {
	/// WebSocket RPC endpoint URL
	#[arg(long, env = "SUBSTRATE_RPC_WS", default_value = "ws://127.0.0.1:9944")]
	url: String,

	/// Ethereum JSON-RPC endpoint URL (for contract interaction via eth-rpc)
	#[arg(long, env = "ETH_RPC_HTTP", default_value = "http://127.0.0.1:8545")]
	eth_rpc_url: String,

	#[command(subcommand)]
	command: Commands,
}

#[derive(Subcommand)]
enum Commands {
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
		Commands::Propose(args) => {
			commands::crrp::run(
				commands::crrp::CrrpAction::Propose(args),
				&cli.url,
				&cli.eth_rpc_url,
			)
			.await?
		},
		Commands::Fetch(args) => {
			commands::crrp::run(commands::crrp::CrrpAction::Fetch(args), &cli.url, &cli.eth_rpc_url)
				.await?
		},
		Commands::Review(args) => {
			commands::crrp::run(
				commands::crrp::CrrpAction::Review(args),
				&cli.url,
				&cli.eth_rpc_url,
			)
			.await?
		},
		Commands::Merge(args) => {
			commands::crrp::run(commands::crrp::CrrpAction::Merge(args), &cli.url, &cli.eth_rpc_url)
				.await?
		},
		Commands::Release(args) => {
			commands::crrp::run(
				commands::crrp::CrrpAction::Release(args),
				&cli.url,
				&cli.eth_rpc_url,
			)
			.await?
		},
		Commands::Status(args) => {
			commands::crrp::run(
				commands::crrp::CrrpAction::Status(args),
				&cli.url,
				&cli.eth_rpc_url,
			)
			.await?
		},
		Commands::Repo(args) => {
			commands::crrp::run(commands::crrp::CrrpAction::Repo(args), &cli.url, &cli.eth_rpc_url)
				.await?
		},
		Commands::Proposals(args) => {
			commands::crrp::run(
				commands::crrp::CrrpAction::Proposals(args),
				&cli.url,
				&cli.eth_rpc_url,
			)
			.await?
		},
		Commands::Chain { action } => commands::chain::run(action, &cli.url).await?,
	}

	Ok(())
}
