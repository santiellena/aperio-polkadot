import { withUserSigner } from "../lib/user-signer.mjs";
import { readBundle, uploadToBulletin } from "../lib/bulletin.mjs";
import { bundleCid } from "../lib/cid.mjs";
import { execContract, deriveH160, isAccountMapped, mapAccount } from "../lib/revive.mjs";
import { aperioRegistryAbi } from "../lib/abi.mjs";
import { deriveRepoId, gitCommitHashToBytes32, normalizeSlug } from "../lib/format.mjs";
import { readHeadCommit } from "../lib/git.mjs";
import { getConfig } from "../lib/config.mjs";

export async function proposeCommand(orgRaw, nameRaw, opts) {
  const cfg = getConfig();
  const organization = normalizeSlug(orgRaw);
  const name = normalizeSlug(nameRaw);
  if (!opts.bundle) throw new Error("--bundle <path> is required");

  const bundleBytes = await readBundle(opts.bundle);
  const { cid } = bundleCid(bundleBytes);

  let commit = opts.commit;
  if (!commit && opts.repo) commit = await readHeadCommit(opts.repo);
  if (!commit) throw new Error("Provide --commit <hash> or --repo <path>.");
  const commitBytes32 = gitCommitHashToBytes32(commit);

  const repoId = deriveRepoId(organization, name);

  process.stdout.write(`Repo         : ${organization}/${name}\n`);
  process.stdout.write(`Repo ID      : ${repoId}\n`);
  process.stdout.write(`Bundle       : ${opts.bundle} (${bundleBytes.length} bytes)\n`);
  process.stdout.write(`Bundle CID   : ${cid}\n`);
  process.stdout.write(`Commit       : ${commit}\n`);

  await withUserSigner(async (signer) => {
    const h160 = deriveH160(signer.publicKey);
    if (!(await isAccountMapped(h160))) {
      process.stdout.write("Mapping account on pallet-revive first...\n");
      await mapAccount(signer.polkadotSigner);
    }

    process.stdout.write("\nUploading bundle to Bulletin chain (Alice signer)...\n");
    await uploadToBulletin(bundleBytes);

    process.stdout.write("\nSubmitting submitProposal()...\n");
    await execContract(
      {
        address: cfg.registryAddress,
        abi: aperioRegistryAbi,
        functionName: "submitProposal",
        args: [repoId, commitBytes32, cid],
      },
      signer.polkadotSigner,
    );
    process.stdout.write("Proposal submitted.\n");
  });
}
