# Contracts

This directory contains the Solidity Proof of Existence example compiled for two execution targets on the same chain.

## Projects

| Project | Path | Toolchain | VM backend |
| --- | --- | --- | --- |
| EVM | [`evm/`](evm/) | Hardhat + solc + viem | REVM |
| PVM | [`pvm/`](pvm/) | Hardhat + `@parity/resolc` + viem | PolkaVM |

Each project includes its own `ProofOfExistence.sol` entrypoint:

- [`evm/contracts/ProofOfExistence.sol`](evm/contracts/ProofOfExistence.sol)
- [`pvm/contracts/ProofOfExistence.sol`](pvm/contracts/ProofOfExistence.sol)

Both projects target either:

- The local dev chain through `eth-rpc`
- Polkadot Hub TestNet (`420420417`)

## Local Deployment

From the repo root, the recommended full local path is:

```bash
./scripts/start-all.sh
```

Manual path against an already running local node, also from the repo root:

```bash
# Terminal 1
./scripts/start-dev.sh

# Terminal 2
eth-rpc --node-rpc-url "${SUBSTRATE_RPC_WS:-ws://127.0.0.1:9944}" --rpc-port "${STACK_ETH_RPC_PORT:-8545}" --rpc-cors all

# Terminal 3
cd contracts/evm && npm install && npm run deploy:local
cd contracts/pvm && npm install && npm run deploy:local
```

## Testnet Deployment

From the repo root:

```bash
cd contracts/evm && npx hardhat vars set PRIVATE_KEY
cd contracts/pvm && npx hardhat vars set PRIVATE_KEY

./scripts/deploy-paseo.sh
```

You can also deploy each project directly with `npm run deploy:testnet`.

## Shared Deployment Outputs

The deploy scripts update:

- `deployments.json` in the repo root
- [`../web/src/config/deployments.ts`](../web/src/config/deployments.ts) for the frontend

## Register Aperio Repo

Use the Node.js CLI in [`../cli/aperio/`](../cli/aperio/) to register a repo — it uploads the bundle to the Bulletin chain (signed by Alice) and calls `createRepo` on the registry (signed by a user-provided SURI).

```bash
cd cli/aperio && npm install
./bin/aperio.mjs import "//Alice"
./bin/aperio.mjs create-repo acme my-repo \
  --bundle /path/to/repo.bundle \
  --repo /path/to/repo
```

Notes:

- Repo ID is derived on-chain and in clients as `keccak256("organization/name")`.
- `--head <commit>` overrides the HEAD read from `--repo`.
- Pass `--permissionless` to allow any address to submit proposals, or grant roles explicitly with `--contributor <address>` / `--reviewer <address>` (repeatable).

## Common Commands

From the repo root:

```bash
# EVM
cd contracts/evm
npm install
npx hardhat compile
npx hardhat test
npm run fmt

# PVM
cd contracts/pvm
npm install
npx hardhat compile
npx hardhat test
npm run fmt
```

See [`../scripts/README.md`](../scripts/README.md) for the local stack scripts and [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) for hosted deployment details.
