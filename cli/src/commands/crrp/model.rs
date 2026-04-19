use alloy::primitives::{Address, FixedBytes};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::PathBuf};

use super::args::WalletBackend;

#[derive(Copy, Clone, Eq, PartialEq)]
pub(super) enum Backend {
	Rpc,
	Mock,
}

#[derive(Default, Serialize, Deserialize)]
pub(super) struct MockState {
	#[serde(default)]
	pub repos: BTreeMap<String, MockRepoState>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub(super) struct MockRepoState {
	/// Next proposal ID to allocate (0-based, per repo), mirroring contract semantics.
	#[serde(default)]
	pub proposal_count: u64,
	#[serde(default)]
	pub release_count: u64,
	#[serde(default)]
	pub head_cid: String,
	#[serde(default)]
	pub proposals: BTreeMap<u64, MockProposalState>,
}

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct MockProposalState {
	pub commit: String,
	#[serde(default)]
	pub base_commit: Option<String>,
	pub cid: String,
	pub bundle_path: String,
	pub state: MockProposalStatus,
	pub submitted_at_unix_secs: u64,
}

#[derive(Copy, Clone, Debug, Default, Serialize, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub(super) enum MockProposalStatus {
	#[default]
	Open,
	Rejected,
	Merged,
}

pub(super) struct CrrpContext {
	pub backend: Backend,
	pub repo_root: PathBuf,
	pub organization: String,
	pub repository: String,
	pub repo_id: FixedBytes<32>,
	pub substrate_rpc_ws: String,
	pub registry: Address,
	pub maintainer: Address,
	pub head_commit: FixedBytes<32>,
	pub head_cid: String,
	pub proposal_count: String,
	pub release_count: String,
	pub wallet_backend: WalletBackend,
	pub papp_term_metadata: Option<String>,
	pub papp_term_endpoint: Option<String>,
}

pub(super) struct PreparedProposal {
	pub commit: String,
	pub base_commit: Option<String>,
}

pub(super) struct MockBundleSubmission {
	pub cid: String,
	pub bundle_path: PathBuf,
}

#[derive(Clone, Serialize, Deserialize)]
pub(super) struct WalletSession {
	pub backend: String,
	pub session_id: String,
	pub created_at_unix_secs: u64,
	pub wallet_label: String,
	#[serde(default)]
	pub chain: Option<String>,
	#[serde(default)]
	pub accounts: Vec<String>,
	#[serde(default)]
	pub local_account_id_hex: Option<String>,
	#[serde(default)]
	pub remote_account_id_hex: Option<String>,
	#[serde(default)]
	pub shared_secret_hex: Option<String>,
	#[serde(default)]
	pub local_secret_hex: Option<String>,
	#[serde(default)]
	pub local_entropy_hex: Option<String>,
	#[serde(default)]
	pub metadata_url: Option<String>,
}
