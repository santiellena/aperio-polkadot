#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Polkadot Stack Template - Frontend ==="
echo ""
echo "INFO: This starts only the web app."
echo "INFO: First run may take 1-2 minutes while npm dependencies install."
echo "INFO: Works with either ./scripts/start-dev.sh or ./scripts/start-local.sh."
echo "INFO: The Statement Store page requires the relay-backed path."
echo ""

cd "$ROOT_DIR/web"
npm install

# Generate PAPI descriptors from the running chain
if curl -s -o /dev/null http://127.0.0.1:9944 2>/dev/null; then
    echo "INFO: Node detected at ws://127.0.0.1:9944 - updating PAPI descriptors..."
    npm run update-types
    npm run codegen
else
    echo "WARN: Node not running at ws://127.0.0.1:9944"
    echo "INFO: Start a chain first with ./scripts/start-dev.sh or ./scripts/start-local.sh"
    echo "INFO: PAPI descriptors may be stale or missing."
    echo ""
fi

npm run dev
