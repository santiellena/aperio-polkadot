import { withUserSigner } from "../lib/user-signer.mjs";
import { getPublicClient } from "../lib/evm-reader.mjs";
import { execContract, deriveH160, isAccountMapped, mapAccount } from "../lib/revive.mjs";
import { aperioRegistryAbi } from "../lib/abi.mjs";
import { deriveRepoId, gitCommitHashToBytes32, normalizeSlug } from "../lib/format.mjs";
import { getConfig } from "../lib/config.mjs";

export async function mergeCommand(orgRaw, nameRaw, proposalIdRaw, opts) {
  const cfg = getConfig();
  const organization = normalizeSlug(orgRaw);
  const name = normalizeSlug(nameRaw);
  const proposalId = BigInt(proposalIdRaw);
  const repoId = deriveRepoId(organization, name);

  // Resolve final commit & CID — default to what the proposal carries.
  const client = getPublicClient();
  const proposal = await client.readContract({
    address: cfg.registryAddress,
    abi: aperioRegistryAbi,
    functionName: "getProposal",
    args: [repoId, proposalId],
  });
  const proposedCommitBytes32 = proposal[1];
  const proposedCid = proposal[2];

  const finalCommit = opts.finalCommit
    ? gitCommitHashToBytes32(opts.finalCommit)
    : proposedCommitBytes32;
  const finalCid = opts.finalCid ?? proposedCid;

  process.stdout.write(`Merging ${organization}/${name} proposal #${proposalId}\n`);
  process.stdout.write(`  Final commit: ${finalCommit}\n`);
  process.stdout.write(`  Final CID   : ${finalCid}\n`);

  await withUserSigner(async (signer) => {
    if (!(await isAccountMapped(deriveH160(signer.publicKey)))) {
      process.stdout.write("Mapping account on pallet-revive first...\n");
      await mapAccount(signer.polkadotSigner);
    }

    process.stdout.write("Submitting mergeProposal()...\n");
    await execContract(
      {
        address: cfg.registryAddress,
        abi: aperioRegistryAbi,
        functionName: "mergeProposal",
        args: [repoId, proposalId, finalCommit, finalCid],
      },
      signer.polkadotSigner,
    );
    process.stdout.write("Merge completed.\n");
  });
}
