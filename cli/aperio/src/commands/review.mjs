import { withUserSigner } from "../lib/user-signer.mjs";
import { execContract, deriveH160, isAccountMapped, mapAccount } from "../lib/revive.mjs";
import { aperioRegistryAbi } from "../lib/abi.mjs";
import { deriveRepoId, normalizeSlug } from "../lib/format.mjs";
import { getConfig } from "../lib/config.mjs";

export async function reviewCommand(orgRaw, nameRaw, proposalIdRaw, opts) {
  const cfg = getConfig();
  const organization = normalizeSlug(orgRaw);
  const name = normalizeSlug(nameRaw);
  const proposalId = BigInt(proposalIdRaw);
  const repoId = deriveRepoId(organization, name);

  if (opts.approve && opts.reject) {
    throw new Error("Specify exactly one of --approve or --reject.");
  }
  if (!opts.approve && !opts.reject) {
    throw new Error("Specify --approve or --reject.");
  }
  const approved = Boolean(opts.approve);

  process.stdout.write(
    `Reviewing ${organization}/${name} proposal #${proposalId}: ${approved ? "APPROVE" : "REJECT"}\n`,
  );

  await withUserSigner(async (signer) => {
    if (!(await isAccountMapped(deriveH160(signer.publicKey)))) {
      process.stdout.write("Mapping account on pallet-revive first...\n");
      await mapAccount(signer.polkadotSigner);
    }

    process.stdout.write("Submitting reviewProposal()...\n");
    await execContract(
      {
        address: cfg.registryAddress,
        abi: aperioRegistryAbi,
        functionName: "reviewProposal",
        args: [repoId, proposalId, approved],
      },
      signer.polkadotSigner,
    );
    process.stdout.write("Review recorded.\n");
  });
}
