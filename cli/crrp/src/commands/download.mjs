import fs from "node:fs/promises";
import path from "node:path";
import { getPublicClient } from "../lib/evm-reader.mjs";
import { crrpRegistryAbi } from "../lib/abi.mjs";
import { deriveRepoId, normalizeSlug } from "../lib/format.mjs";
import { cloneFromBundle, ensureGitAvailable } from "../lib/git.mjs";
import { getConfig } from "../lib/config.mjs";

async function fetchBundle(cid, outPath) {
  const cfg = getConfig();
  const url = `${cfg.bundleGateway}/${cid}`;
  process.stdout.write(`Fetching bundle from ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Gateway returned ${res.status} ${res.statusText} for ${url}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length === 0) throw new Error("Gateway returned an empty bundle.");
  await fs.mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
  await fs.writeFile(outPath, bytes);
  process.stdout.write(`Saved bundle (${bytes.length} bytes) to ${outPath}\n`);
}

export async function downloadCommand(orgRaw, nameRaw, opts) {
  await ensureGitAvailable();
  const cfg = getConfig();
  const organization = normalizeSlug(orgRaw);
  const name = normalizeSlug(nameRaw);
  const repoId = deriveRepoId(organization, name);

  const client = getPublicClient();
  const repo = await client.readContract({
    address: cfg.registryAddress,
    abi: crrpRegistryAbi,
    functionName: "getRepo",
    args: [repoId],
  });
  const [maintainer, headCommit, headCid] = repo;
  if (!headCid || headCid.length === 0) {
    throw new Error(`Repository ${organization}/${name} not found on-chain.`);
  }

  process.stdout.write(`Repository  : ${organization}/${name}\n`);
  process.stdout.write(`Repo ID     : ${repoId}\n`);
  process.stdout.write(`Maintainer  : ${maintainer}\n`);
  process.stdout.write(`HEAD commit : ${headCommit}\n`);
  process.stdout.write(`HEAD CID    : ${headCid}\n`);

  const outDir = path.resolve(opts.out || `${organization}-${name}`);
  const bundlePath = opts.bundleOut
    ? path.resolve(opts.bundleOut)
    : path.join(path.dirname(outDir), `${path.basename(outDir)}.bundle`);

  await fetchBundle(headCid, bundlePath);

  process.stdout.write(`\nCloning bundle into ${outDir}\n`);
  await cloneFromBundle(bundlePath, outDir);
  process.stdout.write("Cloned.\n");

  if (!opts.keepBundle) {
    await fs.rm(bundlePath, { force: true });
    process.stdout.write(`Removed temporary bundle ${bundlePath}\n`);
  }
}
