use codec::Encode;
use sp_core::{blake2_256, sr25519, Pair};
use std::time::Duration;
use subxt::{
	backend::{legacy::LegacyRpcMethods, rpc::RpcClient},
	OnlineClient, PolkadotConfig,
};

use super::state::{allowance_exists, allowance_value, AllowanceTarget};

const ALLOWANCE_POLL_ATTEMPTS: usize = 10;
const ALLOWANCE_POLL_INTERVAL_SECS: u64 = 3;

pub(super) async fn provision_allowance(
	target: &AllowanceTarget,
) -> Result<(), Box<dyn std::error::Error>> {
	let rpc = rpc_client(&target.endpoint).await?;
	let legacy = LegacyRpcMethods::<PolkadotConfig>::new(rpc.clone());
	let api = OnlineClient::<PolkadotConfig>::from_rpc_client(rpc).await?;
	let metadata = api.metadata();

	let system = metadata
		.pallet_by_name("System")
		.ok_or("Runtime metadata is missing System pallet.")?;
	let sudo = metadata
		.pallet_by_name("Sudo")
		.ok_or("Runtime metadata is missing Sudo pallet.")?;
	let set_storage = system
		.call_variant_by_name("set_storage")
		.ok_or("Runtime metadata is missing System.set_storage call.")?;
	let sudo_call = sudo
		.call_variant_by_name("sudo")
		.ok_or("Runtime metadata is missing Sudo.sudo call.")?;

	let alice = sr25519::Pair::from_string("//Alice", None)
		.map_err(|error| format!("Failed to derive Alice dev key: {error}"))?;
	let alice_account = subxt::utils::AccountId32(alice.public().0);
	let nonce = legacy.system_account_next_index(&alice_account).await? as u32;
	let genesis_hash = legacy.genesis_hash().await?;
	let runtime_version = legacy.state_get_runtime_version(None).await?;

	let set_storage_call = build_set_storage_call(
		system.index(),
		set_storage.index,
		&target.storage_key,
		&allowance_value(),
	);
	let call_data = build_sudo_call(sudo.index(), sudo_call.index, &set_storage_call);
	let extrinsic = build_signed_extrinsic(
		&alice,
		&call_data,
		runtime_version.spec_version,
		runtime_version.transaction_version,
		genesis_hash.as_ref(),
		nonce,
	);

	let tx_hash = legacy.author_submit_extrinsic(&extrinsic).await?;
	println!("Submitted allowance bootstrap extrinsic {tx_hash}.");

	for _ in 0..ALLOWANCE_POLL_ATTEMPTS {
		if allowance_exists(target).await? {
			return Ok(());
		}
		tokio::time::sleep(Duration::from_secs(ALLOWANCE_POLL_INTERVAL_SECS)).await;
	}

	Err(format!(
		"Statement Store allowance bootstrap tx {tx_hash} was submitted but allowance did not appear on {}.",
		target.endpoint
	)
	.into())
}

fn build_set_storage_call(
	pallet_index: u8,
	call_index: u8,
	key: &[u8],
	value: &[u8],
) -> Vec<u8> {
	let mut call = Vec::new();
	call.push(pallet_index);
	call.push(call_index);
	call.extend_from_slice(&compact_len(1));
	call.extend_from_slice(&scale_bytes(key));
	call.extend_from_slice(&scale_bytes(value));
	call
}

fn build_sudo_call(pallet_index: u8, call_index: u8, inner_call: &[u8]) -> Vec<u8> {
	let mut call = Vec::new();
	call.push(pallet_index);
	call.push(call_index);
	call.extend_from_slice(inner_call);
	call
}

fn build_signed_extrinsic(
	alice: &sr25519::Pair,
	call_data: &[u8],
	spec_version: u32,
	tx_version: u32,
	genesis_hash: &[u8],
	nonce: u32,
) -> Vec<u8> {
	let mut extra = vec![
		0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	];
	extra.extend_from_slice(&compact_len(nonce));
	extra.push(0x00);
	extra.push(0x00);

	let mut signer_payload = Vec::new();
	signer_payload.extend_from_slice(call_data);
	signer_payload.extend_from_slice(&extra);
	signer_payload.extend_from_slice(&spec_version.to_le_bytes());
	signer_payload.extend_from_slice(&tx_version.to_le_bytes());
	signer_payload.extend_from_slice(genesis_hash);
	signer_payload.extend_from_slice(genesis_hash);

	let to_sign = if signer_payload.len() > 256 {
		blake2_256(&signer_payload).to_vec()
	} else {
		signer_payload
	};
	let signature = alice.sign(&to_sign);

	let mut body = Vec::new();
	body.push(0x84);
	body.push(0x00);
	body.extend_from_slice(&alice.public().0);
	body.push(0x01);
	body.extend_from_slice(signature.as_ref());
	body.extend_from_slice(&extra);
	body.extend_from_slice(call_data);

	let mut extrinsic = compact_len(body.len() as u32);
	extrinsic.extend_from_slice(&body);
	extrinsic
}

fn scale_bytes(bytes: &[u8]) -> Vec<u8> {
	let mut encoded = compact_len(bytes.len() as u32);
	encoded.extend_from_slice(bytes);
	encoded
}

fn compact_len(value: u32) -> Vec<u8> {
	codec::Compact(value).encode()
}

async fn rpc_client(endpoint: &str) -> Result<RpcClient, Box<dyn std::error::Error>> {
	Ok(RpcClient::from_insecure_url(endpoint.to_string()).await?)
}
