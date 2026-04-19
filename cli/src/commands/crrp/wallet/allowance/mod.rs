mod bootstrap;
mod state;

use super::super::model::{CrrpContext, WalletSession};

pub(super) async fn ensure_statement_store_allowance(
	ctx: &CrrpContext,
	session: &WalletSession,
) -> Result<(), Box<dyn std::error::Error>> {
	let target = state::allowance_target(ctx, session)?;

	if state::allowance_exists(&target).await? {
		return Ok(());
	}

	println!(
		"Provisioning dev Statement Store allowance for host session key {} via Alice.",
		target.host_key_hex()
	);
	bootstrap::provision_allowance(&target).await?;
	println!("Statement Store allowance provisioned for host session key.");
	Ok(())
}
