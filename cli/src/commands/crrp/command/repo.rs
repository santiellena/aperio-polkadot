use super::{
	super::{args::RepoArgs, preflight::preflight},
	output::{backend_label, kv, line},
	CrrpResult,
};

pub(crate) async fn run_repo(args: RepoArgs, eth_rpc_url_override: Option<&str>) -> CrrpResult {
	let ctx = preflight(&args.common, eth_rpc_url_override).await?;
	line("CRRP Repo (skeleton)");
	kv("Backend", backend_label(ctx.backend));
	kv("Repository", ctx.repo_root.display());
	kv("Repository slug", format!("{}/{}", ctx.organization, ctx.repository));
	kv("Repo ID", format!("{:#x}", ctx.repo_id));
	kv("Registry", ctx.registry);
	kv("Maintainer", ctx.maintainer);
	kv("On-chain HEAD", format!("{:#x}", ctx.head_commit));
	kv("On-chain HEAD CID", ctx.head_cid);
	kv("Proposals", ctx.proposal_count);
	kv("Releases", ctx.release_count);

	Ok(())
}
