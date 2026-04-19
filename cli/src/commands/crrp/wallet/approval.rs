use blake2::{Blake2b512, Digest};
use serde::{Deserialize, Serialize};
use std::{
	fs,
	path::{Path, PathBuf},
	time::{SystemTime, UNIX_EPOCH},
};

use super::{
	super::{args::WalletBackend, model::CrrpContext},
	allowance::ensure_statement_store_allowance,
	bridge::run_hostpapp_bridge,
	papp::ensure_papp_session,
};

#[derive(Copy, Clone, Debug)]
pub(crate) enum WalletSignatureOrigin {
	PwalletRemote,
	MockDerived,
}

impl WalletSignatureOrigin {
	pub(crate) fn as_str(&self) -> &'static str {
		match self {
			Self::PwalletRemote => "pwallet-remote",
			Self::MockDerived => "mock-derived",
		}
	}

	pub(crate) fn is_stub(&self) -> bool {
		matches!(self, Self::MockDerived)
	}
}

pub(crate) struct WalletTxApprovalReceipt {
	pub approval_id: String,
	pub approved_at_unix_secs: u64,
	pub session_id: Option<String>,
	pub payload_digest_hex: String,
	pub signature_hex: String,
	pub signature_origin: WalletSignatureOrigin,
	pub receipt_path: PathBuf,
}

#[derive(Deserialize)]
struct BridgeSignatureResponse {
	signature_hex: String,
	#[serde(default)]
	session_id: Option<String>,
}

pub(crate) async fn request_wallet_tx_approval(
	ctx: &CrrpContext,
	action_label: &str,
	payload_summary: &str,
) -> Result<WalletTxApprovalReceipt, Box<dyn std::error::Error>> {
	let approved_at_unix_secs = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
	let approval_id =
		build_approval_id(&ctx.repo_root, action_label, payload_summary, approved_at_unix_secs);
	let payload_digest_hex = build_payload_digest(payload_summary);

	let (signature_hex, signature_origin, session_id) = match ctx.wallet_backend {
		WalletBackend::Mock => {
			println!("Mock wallet approval required for {action_label}.");
			println!("Payload summary: {payload_summary}");
			println!("Mock wallet approved transaction request {approval_id}.");
			let signature_hex = build_stub_signature(
				"mock-wallet-signature",
				&[
					ctx.repo_root.display().to_string().as_bytes(),
					action_label.as_bytes(),
					payload_digest_hex.as_bytes(),
					approval_id.as_bytes(),
				],
			);
			(signature_hex, WalletSignatureOrigin::MockDerived, None)
		},
		WalletBackend::Papp => {
			println!("Wallet approval required for {action_label}.");
			println!("Payload summary: {payload_summary}");
			println!(
				"Open pwallet and keep it in foreground to approve the pending signing request."
			);
			let session = ensure_papp_session(ctx, action_label).await?;
			ensure_statement_store_allowance(ctx, &session).await?;
			let (signature_hex, session_id) =
				request_pwallet_signature_from_bridge(ctx, payload_summary).await?;
			if let Some(session_id) = session_id.as_deref() {
				println!("Wallet session: {session_id}");
			}
			println!("Wallet signature received from pwallet.");
			(signature_hex, WalletSignatureOrigin::PwalletRemote, session_id)
		},
	};

	let receipt_path = save_wallet_approval_receipt(
		&ctx.repo_root,
		action_label,
		payload_summary,
		session_id.as_deref(),
		&approval_id,
		approved_at_unix_secs,
		&payload_digest_hex,
		&signature_hex,
		signature_origin,
	)?;

	Ok(WalletTxApprovalReceipt {
		approval_id,
		approved_at_unix_secs,
		session_id,
		payload_digest_hex,
		signature_hex,
		signature_origin,
		receipt_path,
	})
}

async fn request_pwallet_signature_from_bridge(
	ctx: &CrrpContext,
	payload_summary: &str,
) -> Result<(String, Option<String>), Box<dyn std::error::Error>> {
	let payload_hex = format!("0x{}", hex::encode(payload_summary.as_bytes()));
	let output = run_hostpapp_bridge(
		ctx,
		"sign-raw",
		&[
			"--payload-hex".to_string(),
			payload_hex,
			"--timeout-ms".to_string(),
			"180000".to_string(),
		],
	)
	.await?;

	let json_line = output
		.stdout_lines
		.last()
		.ok_or("host-papp signing bridge returned empty output")?;
	let bridge_response: BridgeSignatureResponse = serde_json::from_str(json_line)?;
	Ok((
		normalize_required_signature_hex(&bridge_response.signature_hex)?,
		bridge_response.session_id,
	))
}

fn build_approval_id(
	repo_root: &Path,
	action_label: &str,
	payload_summary: &str,
	approved_at_unix_secs: u64,
) -> String {
	let mut hasher = Blake2b512::new();
	hasher.update(repo_root.display().to_string().as_bytes());
	hasher.update(action_label.as_bytes());
	hasher.update(payload_summary.as_bytes());
	hasher.update(approved_at_unix_secs.to_le_bytes());
	let digest = hasher.finalize();
	hex::encode(&digest[..8])
}

fn build_payload_digest(payload_summary: &str) -> String {
	let mut hasher = Blake2b512::new();
	hasher.update(payload_summary.as_bytes());
	let digest = hasher.finalize();
	format!("0x{}", hex::encode(&digest[..32]))
}

fn build_stub_signature(label: &str, parts: &[&[u8]]) -> String {
	let mut hasher = Blake2b512::new();
	hasher.update(label.as_bytes());
	for part in parts {
		hasher.update(part);
	}
	let digest = hasher.finalize();
	format!("0x{}", hex::encode(&digest[..64]))
}

fn normalize_required_signature_hex(raw: &str) -> Result<String, Box<dyn std::error::Error>> {
	let trimmed = raw.trim();
	let hex = trimmed.strip_prefix("0x").or(trimmed.strip_prefix("0X")).unwrap_or(trimmed);
	if hex.is_empty() {
		return Err("Signature hex cannot be empty.".into());
	}
	if !hex.len().is_multiple_of(2) {
		return Err(format!(
			"Invalid signature length {}. Signature hex must have an even number of characters.",
			hex.len()
		)
		.into());
	}
	if !hex.chars().all(|char| char.is_ascii_hexdigit()) {
		return Err("Signature contains non-hex characters.".into());
	}

	Ok(format!("0x{}", hex.to_lowercase()))
}

fn wallet_approval_receipts_dir(repo_root: &Path) -> PathBuf {
	repo_root.join(".crrp").join("wallet-approvals")
}

#[derive(Serialize)]
struct StoredWalletApprovalReceipt<'a> {
	approval_id: &'a str,
	approved_at_unix_secs: u64,
	action_label: &'a str,
	payload_summary: &'a str,
	payload_digest_hex: &'a str,
	signature_hex: &'a str,
	signature_origin: &'a str,
	is_stub_signature: bool,
	session_id: Option<&'a str>,
}

fn save_wallet_approval_receipt(
	repo_root: &Path,
	action_label: &str,
	payload_summary: &str,
	session_id: Option<&str>,
	approval_id: &str,
	approved_at_unix_secs: u64,
	payload_digest_hex: &str,
	signature_hex: &str,
	signature_origin: WalletSignatureOrigin,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
	let dir = wallet_approval_receipts_dir(repo_root);
	fs::create_dir_all(&dir)?;
	let path = dir.join(format!("{approval_id}.json"));
	let receipt = StoredWalletApprovalReceipt {
		approval_id,
		approved_at_unix_secs,
		action_label,
		payload_summary,
		payload_digest_hex,
		signature_hex,
		signature_origin: signature_origin.as_str(),
		is_stub_signature: signature_origin.is_stub(),
		session_id,
	};
	fs::write(path.clone(), serde_json::to_string_pretty(&receipt)? + "\n")?;
	Ok(path)
}

#[cfg(test)]
mod tests {
	use super::{build_approval_id, build_payload_digest, normalize_required_signature_hex};
	use std::path::Path;

	#[test]
	fn approval_id_is_deterministic_for_same_input() {
		let id_a = build_approval_id(Path::new("/tmp/repo"), "bulletin upload", "bytes=42", 123);
		let id_b = build_approval_id(Path::new("/tmp/repo"), "bulletin upload", "bytes=42", 123);
		assert_eq!(id_a, id_b);
	}

	#[test]
	fn approval_id_changes_when_payload_changes() {
		let id_a = build_approval_id(Path::new("/tmp/repo"), "bulletin upload", "bytes=42", 123);
		let id_b = build_approval_id(Path::new("/tmp/repo"), "bulletin upload", "bytes=43", 123);
		assert_ne!(id_a, id_b);
	}

	#[test]
	fn payload_digest_is_deterministic() {
		let digest_a = build_payload_digest("repo=1,bytes=42");
		let digest_b = build_payload_digest("repo=1,bytes=42");
		assert_eq!(digest_a, digest_b);
		assert!(digest_a.starts_with("0x"));
	}

	#[test]
	fn normalize_signature_hex_accepts_prefixed_and_unprefixed_input() {
		let prefixed =
			normalize_required_signature_hex("0xAABBCC").expect("prefixed signature parses");
		let unprefixed =
			normalize_required_signature_hex("aabbcc").expect("unprefixed signature parses");
		assert_eq!(prefixed, "0xaabbcc");
		assert_eq!(unprefixed, "0xaabbcc");
	}

	#[test]
	fn normalize_signature_hex_rejects_invalid_hex() {
		let error = normalize_required_signature_hex("0xGG")
			.expect_err("invalid signature hex should be rejected");
		assert!(error.to_string().contains("non-hex"));
	}
}
