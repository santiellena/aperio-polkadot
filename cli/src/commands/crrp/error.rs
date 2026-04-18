use thiserror::Error;

#[derive(Debug, Error)]
pub enum CrrpError {
	#[error("create-repo failed: {0}")]
	CreateRepo(String),
	#[error("propose failed: {0}")]
	Propose(String),
	#[error("fetch failed: {0}")]
	Fetch(String),
	#[error("review failed: {0}")]
	Review(String),
	#[error("merge failed: {0}")]
	Merge(String),
	#[error("release failed: {0}")]
	Release(String),
	#[error("status failed: {0}")]
	Status(String),
	#[error("repo failed: {0}")]
	Repo(String),
	#[error("proposals failed: {0}")]
	Proposals(String),
}
