import { withUserSigner } from "../lib/user-signer.mjs";
import { execContract, deriveH160, isAccountMapped, mapAccount } from "../lib/revive.mjs";
import { crrpRegistryAbi } from "../lib/abi.mjs";
import { deriveRepoId, normalizeSlug, requireEthAddress } from "../lib/format.mjs";
import { getConfig } from "../lib/config.mjs";

async function setRole(functionName, orgRaw, nameRaw, addressRaw, enabled) {
  const cfg = getConfig();
  const organization = normalizeSlug(orgRaw);
  const name = normalizeSlug(nameRaw);
  const account = requireEthAddress(addressRaw, functionName === "setContributorRole" ? "contributor" : "reviewer");
  const repoId = deriveRepoId(organization, name);

  process.stdout.write(
    `${enabled ? "Granting" : "Revoking"} ${functionName === "setContributorRole" ? "contributor" : "reviewer"} role on ${organization}/${name} for ${account}\n`,
  );

  await withUserSigner(async (signer) => {
    if (!(await isAccountMapped(deriveH160(signer.publicKey)))) {
      process.stdout.write("Mapping account on pallet-revive first...\n");
      await mapAccount(signer.polkadotSigner);
    }
    process.stdout.write("Submitting role update...\n");
    await execContract(
      {
        address: cfg.registryAddress,
        abi: crrpRegistryAbi,
        functionName,
        args: [repoId, account, enabled],
      },
      signer.polkadotSigner,
    );
    process.stdout.write("Done.\n");
  });
}

export function setContributorCommand(org, name, address, opts) {
  return setRole("setContributorRole", org, name, address, !opts.revoke);
}

export function setReviewerCommand(org, name, address, opts) {
  return setRole("setReviewerRole", org, name, address, !opts.revoke);
}
