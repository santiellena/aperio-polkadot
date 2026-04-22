# aperio — Aperio command-line client

`aperio` is a Node.js CLI for the **Censorship-Resistant Repository Platform (Aperio)**.
It lets developers run the full repository workflow — create, propose, review, merge, download —
without opening the web app. All on-chain writes are signed locally from a Substrate
key you provide via SURI (mnemonic, `//Alice`, or a raw 32-byte seed).

```
┌──────────┐  signed extrinsics (sr25519)   ┌───────────────────────┐
│   aperio   │ ─────────────────────────────▶ │ Paseo Hub TestNet     │
│  (this)  │                                 │ + Bulletin chain      │
└──────────┘                                 └───────────────────────┘
```

## Contents

- [Prerequisites](#prerequisites)
- [Install](#install)
- [Quickstart](#quickstart)
- [Commands](#commands)
- [How signing works](#how-signing-works)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

## Prerequisites

| Tool    | Version  | Purpose                                    |
| ------- | -------- | ------------------------------------------ |
| Node.js | **≥ 22** | runtime (the CLI uses ESM)                 |
| git     | any      | `git bundle create` / `git clone <bundle>` |

A Substrate key with enough Paseo TestNet balance is required to pay fees for
`Revive.map_account` (one-time) and subsequent `Revive.call` extrinsics. Get Paseo
tokens from the faucet; use a dev key (`//Alice`, `//Bob`, `//Charlie`) for local
networks.

Bundle uploads to the Bulletin chain are signed with **`//Alice`** (pre-authorised).
The CLI derives Alice locally from the well-known dev phrase — you don't need to
fund anything for storage.

## Install

From the repository root:

```sh
cd cli/aperio
npm install
```

Link the binary globally (optional — lets you run `aperio` from anywhere):

```sh
npm link
```

Without `npm link`, invoke via `npm start -- <args>` or `node ./bin/aperio.mjs <args>`.

## Quickstart

```sh
# 1. Import a Substrate key. The SURI accepts a dev path, a mnemonic
#    (optionally with //path), or a 0x-prefixed 32-byte seed.
aperio import "//Alice"

# 2. Register the account on pallet-revive (needed for contract calls).
aperio map

# 3. Create a Git bundle of the repository you want to publish.
cd /path/to/my/project
git bundle create /tmp/my-repo.bundle --all

# 4. Create the repo on-chain. Reads HEAD from the current git dir.
aperio create-repo my-org my-repo \
  --bundle /tmp/my-repo.bundle \
  --repo . \
  --permissionless

# 5. As a contributor — propose a change.
git bundle create /tmp/my-repo-update.bundle --all
aperio propose my-org my-repo --bundle /tmp/my-repo-update.bundle --repo .

# 6. As a reviewer — review and merge.
aperio review my-org my-repo 0 --approve
aperio merge  my-org my-repo 0

# 7. Anyone — download the repository via its on-chain HEAD CID.
aperio download my-org my-repo --out ./cloned-repo
```

## Commands

Run `aperio --help` or `aperio <command> --help` for full flag details.

| Command                                                | What it does                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `import <suri>`                                        | Store a Substrate key under `~/.aperio/session.json`.                              |
| `whoami`                                               | Print the imported account, its H160, registry, WS URL.                          |
| `map`                                                  | One-time `pallet_revive::map_account` so the H160 can receive contract state.    |
| `create-repo <org> <name> --bundle <path>`             | Upload bundle to Bulletin (Alice) + register repo via `Revive.call(createRepo)`. |
| `propose <org> <name> --bundle <path>`                 | Upload bundle + submit a proposal.                                               |
| `review <org> <name> <proposalId> --approve\|--reject` | Record a review vote.                                                            |
| `merge <org> <name> <proposalId>`                      | Merge a proposal, defaulting to its own commit & CID.                            |
| `set-contributor <org> <name> <address>` (`--revoke`)  | Add/remove a contributor on a whitelist repo.                                    |
| `set-reviewer <org> <name> <address>` (`--revoke`)     | Add/remove a reviewer.                                                           |
| `download <org> <name> --out <dir>`                    | Resolve HEAD CID on-chain → fetch bundle from the IPFS gateway → `git clone`.    |
| `info <org> <name>`                                    | Print on-chain repo metadata (maintainer, HEAD, counts).                         |

### Common options

- `--bundle <path>` — A Git bundle produced by `git bundle create <file> --all`.
  Max size is **8 MiB** (Bulletin chain limit).
- `--head <commit>` / `--commit <commit>` — 40-char SHA-1 or 64-char SHA-256.
  Can be omitted if you pass `--repo <path>`, in which case HEAD is read from that directory.
- Contributor / reviewer options accept **EVM** addresses (`0x…`), not ss58.

## How signing works

Aperio is an EVM contract (Solidity, deployed via `pallet-revive` on the Polkadot Hub TestNet).
The CLI does not submit EVM transactions directly — instead it:

1. Encodes the Aperio calldata with `viem.encodeFunctionData`.
2. Wraps that calldata in a `pallet_revive::call(dest, value, weight_limit, storage_deposit_limit, data)`
   Substrate extrinsic.
3. Signs the extrinsic locally using the sr25519 key derived from the stored SURI.
   `pallet-revive` executes the contract with `msg.sender` equal to your mapped H160
   (or the keccak-prefix fallback if you skipped `aperio map`).

Bulletin uploads (`TransactionStorage.store`) are always signed with **`//Alice`** — the
CLI derives Alice locally from the well-known dev phrase. Alice is pre-authorised on the
Bulletin chain; your own account is not. This matches the web app's behaviour.

The signer source is picked per-invocation:

1. `APERIO_SIGNER_SURI` environment variable — wins if set (useful for CI/scripts).
2. Otherwise the `suri` field stored in `~/.aperio/session.json` by `aperio import`.

Delete `~/.aperio/session.json` to forget the stored key.

> ⚠️ `aperio import` writes the SURI to disk in plaintext. Fine for testnet dev accounts;
> for anything that matters, prefer `APERIO_SIGNER_SURI` so the secret never lands on disk.

## Configuration

All defaults target Paseo TestNet. Override any of them via environment variables:

| Variable              | Default                                       |
| --------------------- | --------------------------------------------- |
| `APERIO_SIGNER_SURI`    | — (falls back to `~/.aperio/session.json`)      |
| `CRRP_WS_URL`         | `wss://asset-hub-paseo.dotters.network`       |
| `CRRP_ETH_RPC_URL`    | `https://services.polkadothub-rpc.com/testnet`|
| `CRRP_BULLETIN_WS`    | `wss://paseo-bulletin-rpc.polkadot.io`        |
| `CRRP_REGISTRY`       | `0x253028394517e27a6d22233e94b5b53c62926940`  |
| `CRRP_BUNDLE_GATEWAY` | `https://paseo-ipfs.polkadot.io/ipfs`         |
| `APERIO_STATE_DIR`      | `~/.aperio`                                     |

## Troubleshooting

**"No signer configured. Run `aperio import <suri>` first."** — No session file and no
`APERIO_SIGNER_SURI` in the environment. Either import a SURI or export the env var.

**`Bulletin signer is not authorized`** — The test deployment's Alice permit may be
exhausted or the endpoint changed. Re-check `CRRP_BULLETIN_WS`.

**`Account not mapped yet`** — Run `aperio map` once. Subsequent write commands do this
automatically on first use but the explicit command makes the cost visible.

**`execution reverted` from `Revive.call`** — The contract reverted: you lack a
contributor/reviewer role, the proposal is in the wrong state, or you're not the
maintainer. Check `aperio info <org> <name>` and the on-chain proposal status.

**Node refuses to exit after a command.** — All commands call `process.exit`
explicitly after teardown, so this shouldn't happen. If it does, `Ctrl+C` is safe;
no on-chain state is affected.
