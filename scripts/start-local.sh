#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo "=== Polkadot Stack Template - Local Zombienet ==="
echo ""
log_info "This starts just the relay-backed network with no contracts or frontend."
log_info "Typical startup time is 1-3 minutes after the required binaries are installed."
log_info "Use start-all.sh instead if you want contracts, eth-rpc, and the frontend too."
echo ""
echo "[1/3] Building runtime..."
build_runtime
echo "[2/3] Generating chain spec..."
generate_chain_spec
echo "[3/3] Spawning relay chain + parachain via zombienet..."
echo ""

run_zombienet_foreground
