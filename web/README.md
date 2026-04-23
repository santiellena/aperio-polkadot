# Web

React + TypeScript frontend for Aperio.

The app focuses on the current Aperio MVP:

- repository discovery and creation
- proposal submission and review
- maintainer merge flow
- canonical commit history
- release history display
- treasury donation and rewards
- wallet and network configuration

Repository code is not stored by the frontend or the contract. Users provide Git
bundle CIDs, Bulletin stores the bundle bytes, and the registry records canonical
commits and bundle pointers.

Release creation exists in the contract layer, but the current frontend treats
release history as a read surface rather than a release-management workflow.

## Local Development

```bash
cd web
npm install
npm run dev
```

## Build

```bash
cd web
npm run build
```

The build runs PAPI code generation first, then TypeScript and Vite.

## Configuration

Useful build/runtime environment variables:

- `VITE_WS_URL`
- `VITE_ETH_RPC_URL`
- `VITE_APERIO_REGISTRY_KIND`
- `VITE_APERIO_REGISTRY_ADDRESS`
- `VITE_APERIO_REPO_ORGANIZATION`
- `VITE_APERIO_REPO_NAME`
- `VITE_APERIO_BUNDLE_GATEWAY`

Generated PAPI descriptors live in `.papi/` and are used by the frontend for Substrate extrinsics such as `pallet_revive`.
