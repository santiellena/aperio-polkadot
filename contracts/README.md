# Contracts

This directory contains the Aperio Solidity contracts for two execution targets:

| Project | Path | Toolchain | Target |
| --- | --- | --- | --- |
| EVM | `evm/` | Hardhat + solc + viem | Ethereum-compatible bytecode |
| PVM | `pvm/` | Hardhat + `@parity/resolc` + viem | PolkaVM bytecode |

Both projects deploy the same Aperio contract set:

- `AperioRepositoryRegistry.sol` - repositories, proposals, reviews, merges, HEAD, releases, and roles.
- `AperioIncentivesTreasury.sol` - pull-based contribution and review rewards.

The contracts are the canonical protocol layer. They store pointers and decisions,
not repository code. Git bundle bytes stay off-chain in Bulletin/IPFS-addressed
storage.

## Test

```bash
cd contracts/evm
npm install
npm run compile
npm test

cd ../pvm
npm install
npm run compile
npm test
```

## Deploy To Paseo

```bash
# For Paseo you can set Alice private key: 
# 0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133
cd contracts/evm && npx hardhat vars set PRIVATE_KEY
cd ../pvm && npx hardhat vars set PRIVATE_KEY
cd ../..
./scripts/deploy-paseo.sh
```

Deploy scripts update:

- `deployments.json`
- `web/src/config/deployments.ts`
- `cli/aperio/deployments.json`

## CLI Flow

After deployment, create a Git bundle from the repository you want Aperio to track,
then use the CLI to create and operate the on-chain registry entry:

```bash
cd /path/to/project
git checkout main
git bundle create /tmp/repo.bundle --all

cd /path/to/polkadot-stack-template/cli/aperio
npm install
node ./bin/aperio.mjs import "//Alice"
node ./bin/aperio.mjs map
node ./bin/aperio.mjs create-repo acme my-repo \
  --bundle /tmp/repo.bundle \
  --repo /path/to/project \
  --permissionless
```

Release storage is implemented in the registry contract. A dedicated CLI release
command is not implemented yet.
