import { withUserSigner } from "../lib/user-signer.mjs";
import { readBundle, uploadToBulletin } from "../lib/bulletin.mjs";
import { bundleCid } from "../lib/cid.mjs";
import { execContract, deriveH160, isAccountMapped, mapAccount } from "../lib/revive.mjs";
import { aperioRegistryAbi } from "../lib/abi.mjs";
import {
  deriveRepoId,
  gitCommitHashToBytes32,
  normalizeSlug,
  requireEthAddress,
} from "../lib/format.mjs";
import { readHeadCommit } from "../lib/git.mjs";
import { getConfig } from "../lib/config.mjs";

export async function createRepoCommand(orgRaw, nameRaw, opts) {
  const cfg = getConfig();
  const organization = normalizeSlug(orgRaw);
  const name = normalizeSlug(nameRaw);
  if (!opts.bundle) throw new Error("--bundle <path> is required");

  const bundleBytes = await readBundle(opts.bundle);
  const { cid, hash: bundleHash } = bundleCid(bundleBytes);

  let headCommit = opts.head;
  if (!headCommit && opts.repo) {
    headCommit = await readHeadCommit(opts.repo);
  }
  if (!headCommit) {
    throw new Error("Provide --head <commit> or --repo <path> so we can read HEAD.");
  }
  const headBytes32 = gitCommitHashToBytes32(headCommit);

  const contributors = (opts.contributor ?? []).map((c) => requireEthAddress(c, "contributor"));
  const reviewers = (opts.reviewer ?? []).map((r) => requireEthAddress(r, "reviewer"));
  const permissionless = Boolean(opts.permissionless);

  process.stdout.write(`Organization : ${organization}\n`);
  process.stdout.write(`Repository   : ${name}\n`);
  process.stdout.write(`Bundle       : ${opts.bundle} (${bundleBytes.length} bytes)\n`);
  process.stdout.write(`Bundle CID   : ${cid}\n`);
  process.stdout.write(`Bundle hash  : ${bundleHash}\n`);
  process.stdout.write(`HEAD commit  : ${headCommit}\n`);
  process.stdout.write(`Permissionless: ${permissionless}\n`);
  if (contributors.length) process.stdout.write(`Contributors : ${contributors.join(", ")}\n`);
  if (reviewers.length) process.stdout.write(`Reviewers    : ${reviewers.join(", ")}\n`);

  await withUserSigner(async (signer) => {
    const h160 = deriveH160(signer.publicKey);
    const mapped = await isAccountMapped(h160);
    if (!mapped) {
      process.stdout.write("Account not mapped yet. Requesting map_account signature...\n");
      await mapAccount(signer.polkadotSigner);
      process.stdout.write("Mapped.\n");
    }

    process.stdout.write("\nUploading bundle to Bulletin chain (Alice signer)...\n");
    await uploadToBulletin(bundleBytes);
    process.stdout.write("Bundle stored on Bulletin.\n");

    process.stdout.write("\nSubmitting createRepo()...\n");
    await execContract(
      {
        address: cfg.registryAddress,
        abi: aperioRegistryAbi,
        functionName: "createRepo",
        args: [organization, name, headBytes32, cid, permissionless],
      },
      signer.polkadotSigner,
    );
    process.stdout.write("Repository created.\n");

    const repoId = deriveRepoId(organization, name);

    for (const contributor of contributors) {
      process.stdout.write(`Granting contributor role to ${contributor}...\n`);
      await execContract(
        {
          address: cfg.registryAddress,
          abi: aperioRegistryAbi,
          functionName: "setContributorRole",
          args: [repoId, contributor, true],
        },
        signer.polkadotSigner,
      );
    }

    for (const reviewer of reviewers) {
      process.stdout.write(`Granting reviewer role to ${reviewer}...\n`);
      await execContract(
        {
          address: cfg.registryAddress,
          abi: aperioRegistryAbi,
          functionName: "setReviewerRole",
          args: [repoId, reviewer, true],
        },
        signer.polkadotSigner,
      );
    }

    process.stdout.write(`\nDone. Repo ID: ${repoId}\n`);
  });
}
