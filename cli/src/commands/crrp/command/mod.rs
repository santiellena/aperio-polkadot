mod create_repo;
mod fetch;
mod merge;
mod output;
mod proposals;
mod propose;
mod release;
mod repo;
mod review;
mod status;

use std::error::Error;

use super::{args::CrrpAction, error::CrrpError};

pub(super) use create_repo::run_create_repo;
pub(super) use fetch::run_fetch;
pub(super) use merge::run_merge;
pub(super) use proposals::run_proposals;
pub(super) use propose::run_propose;
pub(super) use release::run_release;
pub(super) use repo::run_repo;
pub(super) use review::run_review;
pub(super) use status::run_status;

pub(super) type CrrpResult<T = ()> = Result<T, Box<dyn Error>>;

pub async fn run(action: CrrpAction, eth_rpc_url_override: Option<&str>) -> Result<(), CrrpError> {
	match action {
		CrrpAction::CreateRepo(args) => run_create_repo(args, eth_rpc_url_override)
			.await
			.map_err(|error| CrrpError::CreateRepo(error.to_string()))?,
		CrrpAction::Propose(args) => run_propose(args, eth_rpc_url_override)
			.await
			.map_err(|error| CrrpError::Propose(error.to_string()))?,
		CrrpAction::Fetch(args) => run_fetch(args, eth_rpc_url_override)
			.await
			.map_err(|error| CrrpError::Fetch(error.to_string()))?,
		CrrpAction::Review(args) => run_review(args, eth_rpc_url_override)
			.await
			.map_err(|error| CrrpError::Review(error.to_string()))?,
		CrrpAction::Merge(args) => run_merge(args, eth_rpc_url_override)
			.await
			.map_err(|error| CrrpError::Merge(error.to_string()))?,
		CrrpAction::Release(args) => run_release(args, eth_rpc_url_override)
			.await
			.map_err(|error| CrrpError::Release(error.to_string()))?,
		CrrpAction::Status(args) => run_status(args, eth_rpc_url_override)
			.await
			.map_err(|error| CrrpError::Status(error.to_string()))?,
		CrrpAction::Repo(args) => run_repo(args, eth_rpc_url_override)
			.await
			.map_err(|error| CrrpError::Repo(error.to_string()))?,
		CrrpAction::Proposals(args) => run_proposals(args, eth_rpc_url_override)
			.await
			.map_err(|error| CrrpError::Proposals(error.to_string()))?,
	}

	Ok(())
}
