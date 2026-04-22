import { withUserSigner } from "../lib/user-signer.mjs";
import { deriveH160, isAccountMapped, mapAccount } from "../lib/revive.mjs";

export async function mapCommand() {
  await withUserSigner(async (signer) => {
    const h160 = deriveH160(signer.publicKey);
    process.stdout.write(`Substrate: ${signer.address}\n`);
    process.stdout.write(`EVM H160 : ${h160}\n`);

    const alreadyMapped = await isAccountMapped(h160);
    if (alreadyMapped) {
      process.stdout.write("Already mapped — nothing to do.\n");
      return;
    }

    process.stdout.write("Signing map_account...\n");
    await mapAccount(signer.polkadotSigner);
    process.stdout.write("Account mapped.\n");
  });
}
