use serde::Deserialize;
use std::time::{SystemTime, UNIX_EPOCH};

use super::{
	bridge::run_hostpapp_bridge,
	super::model::{CrrpContext, WalletSession},
	session::{load_wallet_session, save_wallet_session},
};

const HOST_PAPP_AUTH_TIMEOUT_MS: &str = "180000";

#[derive(Deserialize)]
struct BridgeAuthResponse {
	session_id: String,
	endpoint: String,
	metadata: String,
	address: String,
	local_account_id_hex: String,
	remote_account_id_hex: String,
	local_secret_hex: String,
	local_entropy_hex: String,
}

pub(super) async fn ensure_papp_session(
	ctx: &CrrpContext,
	action_label: &str,
) -> Result<WalletSession, Box<dyn std::error::Error>> {
	if let Some(session) = load_wallet_session(&ctx.repo_root)? {
		if has_crypto_material(&session) {
			println!(
				"Wallet session active ({} via {}). Continuing with {}.",
				session.session_id, session.wallet_label, action_label
			);
			return Ok(session);
		}

		println!(
			"Wallet session {} is missing signing key material. Re-authentication required.",
			session.session_id
		);
	}

	println!("Wallet sign-in required for {action_label}.");
	println!("Open pwallet and keep it in foreground to complete pairing.");

	let bridge_response = run_hostpapp_auth_bridge(ctx).await?;
	let session = WalletSession {
		backend: "papp-hostpapp".to_string(),
		session_id: bridge_response.session_id,
		created_at_unix_secs: SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs(),
		wallet_label: "pwallet".to_string(),
		chain: Some(bridge_response.endpoint),
		accounts: vec![bridge_response.address],
		local_account_id_hex: Some(bridge_response.local_account_id_hex),
		remote_account_id_hex: Some(bridge_response.remote_account_id_hex),
		shared_secret_hex: None,
		local_secret_hex: Some(bridge_response.local_secret_hex),
		local_entropy_hex: Some(bridge_response.local_entropy_hex),
		metadata_url: Some(bridge_response.metadata),
	};

	save_wallet_session(&ctx.repo_root, &session)?;
	println!("Wallet connected via pwallet (session {}).", session.session_id);
	Ok(session)
}

async fn run_hostpapp_auth_bridge(
	ctx: &CrrpContext,
) -> Result<BridgeAuthResponse, Box<dyn std::error::Error>> {
	let output = run_hostpapp_bridge(
		ctx,
		"auth",
		&["--timeout-ms".to_string(), HOST_PAPP_AUTH_TIMEOUT_MS.to_string()],
	)
	.await?;
	let json_line = output
		.stdout_lines
		.last()
		.ok_or("host-papp auth bridge returned empty output")?;
	let bridge_response: BridgeAuthResponse = serde_json::from_str(json_line)?;
	Ok(bridge_response)
}

fn has_crypto_material(session: &WalletSession) -> bool {
	session.local_account_id_hex.is_some()
		&& session.remote_account_id_hex.is_some()
		&& session.local_secret_hex.is_some()
		&& session.local_entropy_hex.is_some()
}
