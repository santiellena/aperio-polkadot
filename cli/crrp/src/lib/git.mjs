import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
      cwd: options.cwd,
    });
    let stderr = "";
    if (child.stderr && options.quiet) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve();
      const detail = options.quiet && stderr ? `: ${stderr.trim()}` : "";
      reject(new Error(`${cmd} ${args.join(" ")} exited ${code}${detail}`));
    });
  });
}

export async function ensureGitAvailable() {
  try {
    await runCommand("git", ["--version"], { quiet: true });
  } catch {
    throw new Error("`git` was not found on PATH. Install Git and retry.");
  }
}

/**
 * Create a Git bundle from an existing repository. Writes to outPath.
 * The repo must contain at least one commit reachable from HEAD.
 */
export async function createBundle(repoDir, outPath) {
  await ensureGitAvailable();
  const stats = await fs.stat(repoDir).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new Error(`Not a directory: ${repoDir}`);
  }
  await fs.mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
  await runCommand("git", ["bundle", "create", path.resolve(outPath), "--all"], {
    cwd: repoDir,
  });
}

/**
 * Read HEAD of a git repo. Returns the 40-char SHA-1 hash.
 */
export async function readHeadCommit(repoDir) {
  await ensureGitAvailable();
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["rev-parse", "HEAD"], {
      cwd: repoDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`git rev-parse HEAD exited ${code}: ${err.trim()}`));
    });
  });
}

/**
 * Clone from a local bundle file into a target directory.
 * Creates targetDir if missing. Fails if targetDir already contains files.
 */
export async function cloneFromBundle(bundlePath, targetDir) {
  await ensureGitAvailable();
  await fs.mkdir(path.dirname(path.resolve(targetDir)), { recursive: true });
  const existing = await fs.readdir(targetDir).catch(() => null);
  if (existing && existing.length > 0) {
    throw new Error(`Target directory is not empty: ${targetDir}`);
  }
  await runCommand("git", ["clone", path.resolve(bundlePath), path.resolve(targetDir)]);
}
