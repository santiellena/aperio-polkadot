#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Polkadot Stack Template - Frontend ==="
echo ""
echo "  Make sure the node is running: ./scripts/start-dev.sh"
echo ""

cd "$ROOT_DIR/web"
npm install
npm run dev
