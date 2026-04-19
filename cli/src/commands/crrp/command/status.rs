use super::{
	super::{args::StatusArgs, git::git_output, preflight::preflight},
	output::{backend_label, kv, line},
	CrrpResult,
};

pub(crate) async fn run_status(args: StatusArgs, eth_rpc_url_override: Option<&str>) -> CrrpResult {
	let ctx = preflight(&args.common, eth_rpc_url_override).await?;
	let branch = git_output(&ctx.repo_root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
	let local_head = git_output(&ctx.repo_root, &["rev-parse", "HEAD"])?;

	line("CRRP Status (skeleton)");
	kv("Backend", backend_label(ctx.backend));
	kv("Repository", ctx.repo_root.display());
	kv("Repository slug", format!("{}/{}", ctx.organization, ctx.repository));
	kv("Repo ID", format!("{:#x}", ctx.repo_id));
	kv("Registry", ctx.registry);
	kv("Branch", branch);
	kv("Local HEAD", local_head);
	kv("On-chain HEAD", format!("{:#x}", ctx.head_commit));
	kv("On-chain HEAD CID", ctx.head_cid);
	kv("On-chain proposals", ctx.proposal_count);
	kv("On-chain releases", ctx.release_count);

	Ok(())
}
