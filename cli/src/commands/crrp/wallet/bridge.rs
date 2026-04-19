use std::{path::PathBuf, process::Stdio};

use tokio::{
	io::{AsyncBufReadExt, BufReader},
	process::Command,
};

use super::super::model::CrrpContext;
use super::session::wallet_session_path;

pub(super) struct BridgeRunOutput {
	pub stdout_lines: Vec<String>,
}

pub(super) async fn run_hostpapp_bridge(
	ctx: &CrrpContext,
	subcommand: &str,
	extra_args: &[String],
) -> Result<BridgeRunOutput, Box<dyn std::error::Error>> {
	let script_path = hostpapp_script_path()?;
	let session_file = wallet_session_path(&ctx.repo_root);

	let mut command = Command::new("node");
	command
		.arg("--experimental-wasm-modules")
		.arg(script_path)
		.arg(subcommand)
		.arg("--session-out")
		.arg(session_file);

	apply_optional_bridge_args(&mut command, ctx);

	for arg in extra_args {
		command.arg(arg);
	}

	command.stdout(Stdio::piped()).stderr(Stdio::piped());
	let mut child = command.spawn()?;
	let stdout = child
		.stdout
		.take()
		.ok_or("failed to capture host-papp bridge stdout pipe")?;
	let stderr = child
		.stderr
		.take()
		.ok_or("failed to capture host-papp bridge stderr pipe")?;

	let stdout_task = tokio::spawn(async move {
		let mut lines = BufReader::new(stdout).lines();
		let mut collected = Vec::new();
		while let Some(line) = lines.next_line().await? {
			if !line.trim().is_empty() {
				collected.push(line);
			}
		}
		Ok::<Vec<String>, std::io::Error>(collected)
	});
	let stderr_task = tokio::spawn(async move {
		let mut lines = BufReader::new(stderr).lines();
		let mut collected = Vec::new();
		while let Some(line) = lines.next_line().await? {
			let trimmed = line.trim();
			if !trimmed.is_empty() {
				eprintln!("{trimmed}");
				collected.push(trimmed.to_string());
			}
		}
		Ok::<Vec<String>, std::io::Error>(collected)
	});

	let status = child.wait().await?;
	let stdout_lines = stdout_task.await??;
	let stderr_lines = stderr_task.await??;

	if !status.success() {
		return Err(format_bridge_error(status, &stdout_lines, &stderr_lines, subcommand).into());
	}

	Ok(BridgeRunOutput { stdout_lines })
}

fn hostpapp_script_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
	let script_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
		.join("wallet-bridge")
		.join("pwallet-hostpapp.mjs");
	if !script_path.exists() {
		return Err(format!(
			"Missing host-papp wallet bridge script: {}. Ensure cli/wallet-bridge is present and dependencies are installed.",
			script_path.display()
		)
		.into());
	}

	Ok(script_path)
}

fn apply_optional_bridge_args(command: &mut Command, ctx: &CrrpContext) {
	if let Some(endpoint) = ctx
		.papp_term_endpoint
		.as_deref()
		.map(str::trim)
		.filter(|value| !value.is_empty())
	{
		command.arg("--endpoint").arg(endpoint);
	}
	if let Some(metadata) = ctx
		.papp_term_metadata
		.as_deref()
		.map(str::trim)
		.filter(|value| !value.is_empty())
	{
		command.arg("--metadata").arg(metadata);
	}
}

fn format_bridge_error(
	status: std::process::ExitStatus,
	stdout_lines: &[String],
	stderr_lines: &[String],
	subcommand: &str,
) -> String {
	format!(
		"host-papp {} bridge failed (status {}). stderr: {} stdout: {}",
		subcommand,
		status,
		stderr_lines.join("\n").trim(),
		stdout_lines.join("\n").trim()
	)
}
