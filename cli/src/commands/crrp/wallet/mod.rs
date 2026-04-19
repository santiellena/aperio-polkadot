mod allowance;
mod approval;
mod bridge;
mod papp;
mod session;

use super::{
	args::WalletBackend,
	model::{CrrpContext, WalletSession},
};

pub(super) use approval::request_wallet_tx_approval;
#[cfg(test)]
pub(super) use session::load_wallet_session;

pub(super) async fn ensure_wallet_session(
	ctx: &CrrpContext,
	action_label: &str,
) -> Result<WalletSession, Box<dyn std::error::Error>> {
	match ctx.wallet_backend {
		WalletBackend::Mock => session::ensure_mock_wallet_session(&ctx.repo_root, action_label),
		WalletBackend::Papp => papp::ensure_papp_session(ctx, action_label).await,
	}
}
