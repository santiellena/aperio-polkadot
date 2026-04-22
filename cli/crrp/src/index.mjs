import process from "node:process";
import { Command } from "commander";
import { importCommand } from "./commands/import.mjs";
import { whoamiCommand } from "./commands/whoami.mjs";
import { mapCommand } from "./commands/map.mjs";
import { createRepoCommand } from "./commands/create-repo.mjs";
import { proposeCommand } from "./commands/propose.mjs";
import { reviewCommand } from "./commands/review.mjs";
import { mergeCommand } from "./commands/merge.mjs";
import { setContributorCommand, setReviewerCommand } from "./commands/roles.mjs";
import { downloadCommand } from "./commands/download.mjs";
import { infoCommand } from "./commands/info.mjs";
import { destroyAllClients } from "./lib/chain.mjs";

function wrap(fn) {
  return async (...args) => {
    try {
      await fn(...args);
      await teardown(0);
    } catch (err) {
      process.stderr.write(`\nerror: ${err instanceof Error ? err.message : err}\n`);
      await teardown(1);
    }
  };
}

async function teardown(code) {
  try {
    destroyAllClients();
  } catch {
    // best effort
  }
  // Long-lived WebSocket clients keep the event loop alive; force exit once we're done.
  setTimeout(() => process.exit(code), 50).unref();
}

const program = new Command();

program
  .name("crrp")
  .description("CRRP command-line client — signs CRRP and Bulletin txs with a user-provided key.")
  .version("0.1.0");

program
  .command("import <suri>")
  .description(
    'Import a signer key from a SURI. Accepts "//Alice", a 12/24-word ' +
      'mnemonic (optionally with "//path"), or a 0x-prefixed 32-byte seed.',
  )
  .action(wrap(importCommand));

program
  .command("whoami")
  .description("Show the imported Substrate account, its H160, and Revive mapping status.")
  .action(wrap(whoamiCommand));

program
  .command("map")
  .description("Register the Substrate account on pallet-revive (one-time).")
  .action(wrap(mapCommand));

program
  .command("create-repo <organization> <name>")
  .description("Upload a Git bundle to Bulletin and register the repository on the CRRP registry.")
  .requiredOption("--bundle <path>", "path to the .bundle file")
  .option("--head <commit>", "HEAD commit hash (40-char SHA-1 or 64-char SHA-256)")
  .option("--repo <path>", "git directory — reads HEAD automatically if --head is omitted")
  .option("--permissionless", "allow any address to submit proposals", false)
  .option("--contributor <address...>", "contributor to whitelist (repeat)")
  .option("--reviewer <address...>", "reviewer to whitelist (repeat)")
  .action(wrap(createRepoCommand));

program
  .command("propose <organization> <name>")
  .description("Upload a new bundle and submit a proposal to an existing repository.")
  .requiredOption("--bundle <path>", "path to the .bundle file")
  .option("--commit <hash>", "proposed HEAD commit (defaults to --repo HEAD)")
  .option("--repo <path>", "git directory — reads HEAD automatically if --commit is omitted")
  .action(wrap(proposeCommand));

program
  .command("review <organization> <name> <proposalId>")
  .description("Approve or reject a proposal.")
  .option("--approve", "record an approval")
  .option("--reject", "record a rejection")
  .action(wrap(reviewCommand));

program
  .command("merge <organization> <name> <proposalId>")
  .description("Merge an approved proposal; defaults to the proposal's commit & CID.")
  .option("--final-commit <hash>", "override the final commit hash")
  .option("--final-cid <cid>", "override the final bundle CID")
  .action(wrap(mergeCommand));

program
  .command("set-contributor <organization> <name> <address>")
  .description("Add or remove a contributor on a whitelist repo.")
  .option("--revoke", "revoke the role instead of granting", false)
  .action(wrap(setContributorCommand));

program
  .command("set-reviewer <organization> <name> <address>")
  .description("Add or remove a reviewer.")
  .option("--revoke", "revoke the role instead of granting", false)
  .action(wrap(setReviewerCommand));

program
  .command("download <organization> <name>")
  .description("Resolve the repository's HEAD CID, download the bundle, and clone it.")
  .option("--out <dir>", "target directory for the clone")
  .option("--bundle-out <path>", "where to write the fetched .bundle")
  .option("--keep-bundle", "keep the downloaded .bundle after cloning", false)
  .action(wrap(downloadCommand));

program
  .command("info <organization> <name>")
  .description("Print repository metadata from the on-chain registry.")
  .action(wrap(infoCommand));

await program.parseAsync(process.argv);
