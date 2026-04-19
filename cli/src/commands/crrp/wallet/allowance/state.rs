use subxt::{
	backend::{legacy::LegacyRpcMethods, rpc::RpcClient},
	PolkadotConfig,
};

use crate::commands::crrp::model::{CrrpContext, WalletSession};

const ALLOWANCE_PREFIX: &[u8] = b":statement-allowance:";

pub(super) struct AllowanceTarget {
	pub endpoint: String,
	pub host_pubkey: [u8; 32],
	pub storage_key: Vec<u8>,
}

impl AllowanceTarget {
	pub(super) fn host_key_hex(&self) -> String {
		hex::encode(self.host_pubkey)
	}
}

pub(super) fn allowance_target(
	ctx: &CrrpContext,
	session: &WalletSession,
) -> Result<AllowanceTarget, Box<dyn std::error::Error>> {
	let endpoint = ctx
		.papp_term_endpoint
		.as_deref()
		.or(session.chain.as_deref())
		.ok_or("Missing People-chain endpoint for pwallet Statement Store flow.")?
		.to_string();
	let host_pubkey = host_pubkey_from_session(session)?;
	let storage_key = allowance_key(&host_pubkey);

	Ok(AllowanceTarget { endpoint, host_pubkey, storage_key })
}

pub(super) async fn allowance_exists(
	target: &AllowanceTarget,
) -> Result<bool, Box<dyn std::error::Error>> {
	let rpc = rpc_client(&target.endpoint).await?;
	let legacy = LegacyRpcMethods::<PolkadotConfig>::new(rpc);

	match legacy.state_get_storage(&target.storage_key, None).await {
		Ok(Some(_)) => Ok(true),
		Ok(None) => Ok(false),
		Err(error) if error.to_string().contains("state_getStorage") => {
			let changes = legacy
				.state_query_storage_at([target.storage_key.as_slice()], None)
				.await?;
			let present = changes.iter().any(|change_set| {
				change_set
					.changes
					.iter()
					.any(|(storage_key, value)| storage_key.0 == target.storage_key && value.is_some())
			});
			Ok(present)
		},
		Err(error) => Err(format!(
			"Failed to query Statement Store allowance on {}: {}",
			target.endpoint, error
		)
		.into()),
	}
}

pub(super) fn allowance_value() -> Vec<u8> {
	let mut value = Vec::with_capacity(8);
	value.extend_from_slice(&50u32.to_le_bytes());
	value.extend_from_slice(&51_200u32.to_le_bytes());
	value
}

fn host_pubkey_from_session(
	session: &WalletSession,
) -> Result<[u8; 32], Box<dyn std::error::Error>> {
	let local_account = session
		.local_account_id_hex
		.as_deref()
		.ok_or("Wallet session is missing local_account_id_hex. Re-run pwallet sign-in.")?;
	decode_hex32(local_account, "wallet session local account id")
}

fn allowance_key(pubkey: &[u8; 32]) -> Vec<u8> {
	let mut key = Vec::with_capacity(ALLOWANCE_PREFIX.len() + pubkey.len());
	key.extend_from_slice(ALLOWANCE_PREFIX);
	key.extend_from_slice(pubkey);
	key
}

fn decode_hex32(
	value: &str,
	label: &str,
) -> Result<[u8; 32], Box<dyn std::error::Error>> {
	let trimmed = value.trim();
	let stripped = trimmed
		.strip_prefix("0x")
		.or_else(|| trimmed.strip_prefix("0X"))
		.unwrap_or(trimmed);
	let bytes = hex::decode(stripped)
		.map_err(|error| format!("Invalid {label} hex {trimmed}: {error}"))?;
	if bytes.len() != 32 {
		return Err(format!(
			"Invalid {label}: expected 32 bytes, got {}.",
			bytes.len()
		)
		.into());
	}
	let mut output = [0u8; 32];
	output.copy_from_slice(&bytes);
	Ok(output)
}

async fn rpc_client(endpoint: &str) -> Result<RpcClient, Box<dyn std::error::Error>> {
	Ok(RpcClient::from_insecure_url(endpoint.to_string()).await?)
}
