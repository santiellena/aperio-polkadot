# Aperio CLI

## Overview

The CLI is the command-line interface for the Aperio MVP. It lets developers create
repositories, submit proposal bundles, review proposals, merge accepted work, manage
roles, inspect repository state, and download canonical bundles without opening the
web app.

The long-term target is a Git-native workflow where Aperio feels close to:

```bash
git push polkadot main
```

The current implementation is more explicit. Users create a Git bundle, pass it to
`aperio`, and sign the resulting Polkadot Hub / `pallet-revive` calls with a
configured SURI.

---

## Implemented Command Set

Run `aperio --help` or `aperio <command> --help` for flag-level details.

| Command | Purpose |
| --- | --- |
| `aperio import <suri>` | Store a testnet/dev signer in `~/.aperio/session.json`. |
| `aperio whoami` | Show the configured account, H160 address, registry, and network. |
| `aperio map` | Register the Substrate account on `pallet-revive`. |
| `aperio create-repo <org> <name> --bundle <path> --repo <path>` | Upload the initial Git bundle and create the repo on-chain. |
| `aperio propose <org> <name> --bundle <path> --repo <path>` | Upload a proposal bundle and submit its proposed commit. |
| `aperio review <org> <name> <proposalId> --approve\|--reject` | Record a reviewer decision. |
| `aperio merge <org> <name> <proposalId>` | Maintainer records the accepted final commit and CID. |
| `aperio set-contributor <org> <name> <address>` | Grant or revoke contributor access on whitelist repos. |
| `aperio set-reviewer <org> <name> <address>` | Grant or revoke reviewer access. |
| `aperio download <org> <name> --out <dir>` | Resolve the canonical HEAD CID and clone the Git bundle. |
| `aperio info <org> <name>` | Print repository metadata from the registry. |

Not implemented in the CLI yet:

- `git push polkadot main`
- `aperio fetch <proposalId>`
- `aperio release <version>`
- `aperio status`, `aperio repo`, and `aperio proposals`

---

## Current Flow

### Contributor

```bash
git checkout main
git status
git rev-parse HEAD
git bundle create /tmp/my-repo.bundle --all

aperio propose my-org my-repo \
  --bundle /tmp/my-repo.bundle \
  --repo .
```

The CLI reads the commit from Git, derives the bundle CID from the file bytes,
uploads the bundle to Bulletin, and submits `submitProposal`.

### Reviewer

```bash
aperio review my-org my-repo 0 --approve
aperio review my-org my-repo 0 --reject
```

Reviewers inspect proposal bundles off-chain. The CLI records only the approval or
rejection on-chain.

### Maintainer

```bash
aperio merge my-org my-repo 0
```

By default, `merge` records the proposal commit and CID as the final accepted
result. If conflict resolution produces a different local commit and bundle, the
maintainer can pass `--final-commit` and `--final-cid`.

### Download

```bash
aperio download my-org my-repo --out ./cloned-repo
```

The CLI reads the repository HEAD CID from the contract, downloads the bundle
through the configured gateway, and clones it with Git.

---

## Signing Model

Production invariant:

> The CLI should not persist production private keys.

Current MVP behavior:

- `APERIO_SIGNER_SURI` is preferred for scripts and avoids writing a SURI to disk.
- `aperio import <suri>` stores the SURI in plaintext under `~/.aperio/session.json`.
- `aperio import` is a testnet/dev convenience only. Do not use it for valuable keys.

The CLI signs `pallet_revive::call` extrinsics locally. Bulletin uploads are signed
with the pre-authorized `//Alice` dev account used by the current test deployment.

---

## Responsibilities

- Git integration: read repository HEAD and work with Git bundles.
- Artifact handling: compute bundle CIDs, upload bundles to Bulletin, and download canonical bundles.
- Contract interaction: encode registry calls and submit them through `pallet-revive`.
- Role operations: update contributor and reviewer permissions.
- Repository inspection: read canonical HEAD, proposal counts, release counts, and treasury data.

---

## Target Developer Experience

The intended future CLI should reduce the explicit steps above while preserving the
same protocol boundaries:

```bash
git commit
git push polkadot main
```

Internally, that target flow would:

1. Detect the repo state.
2. Create the Git bundle.
3. Upload the artifact to Bulletin.
4. Request an external wallet signature.
5. Submit the registry transaction.
6. Return the proposal or merge result.

The target production signer should request signatures from a wallet instead of
persisting private key material.

---

## UX Rules

- Use human protocol language: "Proposal submitted", "Review recorded", "Merge completed".
- Keep Git as the user's mental model; expose CIDs and hashes only when they are useful.
- Keep merges off-chain. The CLI may orchestrate Git, but the contract only records the final result.
- Preserve the single-branch model: `main` is the only supported repository branch.

---

## Final Mental Model

- Git → manages code  
- CLI → manages interaction  
- Wallet → confirms intent  
- Bulletin → stores bundle artifacts
- Contract → records canonical truth

---

## One-Line Summary

> The CLI turns Git bundles into Aperio registry actions while keeping code off-chain and canonical decisions on-chain.
