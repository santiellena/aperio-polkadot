import { getPublicClient } from "../lib/evm-reader.mjs";
import { aperioRegistryAbi } from "../lib/abi.mjs";
import { deriveRepoId, normalizeSlug } from "../lib/format.mjs";
import { getConfig } from "../lib/config.mjs";

export async function infoCommand(orgRaw, nameRaw) {
  const cfg = getConfig();
  const organization = normalizeSlug(orgRaw);
  const name = normalizeSlug(nameRaw);
  const repoId = deriveRepoId(organization, name);

  const client = getPublicClient();
  const repo = await client.readContract({
    address: cfg.registryAddress,
    abi: aperioRegistryAbi,
    functionName: "getRepo",
    args: [repoId],
  });
  const [maintainer, headCommit, headCid, proposalCount, releaseCount] = repo;

  let permissionless = false;
  try {
    permissionless = await client.readContract({
      address: cfg.registryAddress,
      abi: aperioRegistryAbi,
      functionName: "isPermissionlessContributions",
      args: [repoId],
    });
  } catch {
    // older contract versions may not expose this — ignore.
  }

  process.stdout.write(`Repository     : ${organization}/${name}\n`);
  process.stdout.write(`Repo ID        : ${repoId}\n`);
  process.stdout.write(`Maintainer     : ${maintainer}\n`);
  process.stdout.write(`HEAD commit    : ${headCommit}\n`);
  process.stdout.write(`HEAD CID       : ${headCid}\n`);
  process.stdout.write(`Proposals      : ${proposalCount}\n`);
  process.stdout.write(`Releases       : ${releaseCount}\n`);
  process.stdout.write(`Permissionless : ${permissionless}\n`);
}
