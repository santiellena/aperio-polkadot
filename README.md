# Aperio

Aperio is a censorship-resistant repository platform. Git keeps code and history off-chain, Bulletin stores Git bundle artifacts, and the smart contract records canonical repository decisions: HEAD, proposals, reviews, merges, and releases.

The core flow is:

```text
Git -> Bundle -> Upload -> CID -> Contract -> HEAD
```

## Project Scope

- `web/` - React frontend for repository discovery, proposals, maintainer actions, rewards, and wallet configuration.
- `contracts/` - Solidity contracts for the Aperio repository registry and incentives treasury, compiled for EVM and PVM.
- `cli/aperio/` - Node.js CLI for creating repositories, proposing bundles, reviewing, merging, and downloading canonical bundles.
- `scripts/` - Deployment helpers for contracts and the frontend.
- `.github/workflows/` - CI for web/contracts plus DotNS frontend deployment.

The old Polkadot runtime/pallet template has been removed. Aperio targets existing Polkadot Hub / Asset Hub infrastructure through `pallet-revive`, the Ethereum RPC endpoint, PAPI descriptors, and the Bulletin chain.

## Quick Start

Prerequisites:

- Node.js 22
- npm 10+
- git

Install and build the frontend:

```bash
cd web
npm install
npm run build
```

Run the web app locally:

```bash
cd web
npm run dev:paseo
# Then open this link: https://dot.li/localhost:5173
```

Install the CLI:

```bash
cd cli/aperio
npm install
npm link
aperio --help
```

Run contract tests:

```bash
cd contracts/evm
npm install
npm test

cd ../pvm
npm install
npm test
```

## Deployment

Deploy contracts to Polkadot Testnet (Paseo):

```bash
# For Paseo you can set Alice private key: 
# 0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133
cd contracts/evm && npx hardhat vars set PRIVATE_KEY
cd ../pvm && npx hardhat vars set PRIVATE_KEY
cd ../..
./scripts/deploy-paseo.sh
```

Deploy the frontend via the GitHub Actions.

## Documentation

- [docs/PROJECT.md](docs/PROJECT.md) - Aperio architecture and protocol model.
- [docs/CLI.md](docs/CLI.md) - Current CLI behavior and target developer experience.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Contract and frontend deployment notes.
- [contracts/README.md](contracts/README.md) - Contract project commands.
- [cli/aperio/README.md](cli/aperio/README.md) - CLI command reference.
- [web/README.md](web/README.md) - Frontend development notes.
- [scripts/README.md](scripts/README.md) - Deployment helper scripts.

## Current MVP Status

- Contracts implement repository creation, proposals, reviews, maintainer merges, canonical HEAD tracking, releases, roles, and pull-based rewards.
- The CLI implements create, propose, review, merge, role management, download, and info commands.
- The frontend supports repository discovery and operation flows, and reads canonical history.
- Release creation exists in the contract layer; a dedicated CLI/web release command is not part of the current MVP surface yet.

## Invariants

- Git builds state off-chain.
- Bulletin stores bundle bytes addressed by CID.
- The contract selects canonical truth.
- Releases point only to accepted commits.
- Production signing should be wallet or environment-driven. The current CLI includes a plaintext SURI import helper for testnet/dev accounts only.
