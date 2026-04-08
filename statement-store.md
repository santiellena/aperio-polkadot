# Statement Store — Local Testing Status

Tracking open issues getting the Statement Store fully working for local development.

## Current State

The Statement Store is an off-chain, peer-to-peer data propagation layer built into
Substrate nodes.  Our runtime includes `pallet-statement` and implements the
`ValidateStatement` runtime API.  The node is launched with `--enable-statement-store`.

**Installed binary:** `polkadot-omni-node 1.21.3-47f1ee9e527` (polkadot-sdk stable2512-3).

## How these findings were verified

All claims were verified against the **polkadot-stable2512-3** tag in polkadot-sdk
(not the local checkout, which is on `shawntabrizi/fix-dev-statement-store`).

1. **RPC methods observed at runtime:** Started the node with
   `--dev-block-time 3000 --enable-statement-store` and queried:
   ```
   curl -s -X POST http://127.0.0.1:9944 \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"rpc_methods","params":[]}'
   ```
   Result: no `statement_*` methods in the response.

2. **Source verified at stable2512-3 tag** using `git show polkadot-stable2512-3:<path>`:
   - `cumulus/polkadot-omni-node/lib/src/common/spec.rs` — `start_dev_node` signature
     is `(config, mode)`, no `node_extra_args` parameter.
   - `cumulus/polkadot-omni-node/lib/src/command.rs:305` — dev mode returns early
     before `node_extra_args` is consumed.
   - `substrate/client/rpc-api/src/statement/mod.rs` — `StatementApi` trait only
     defines `statement_submit` and `statement_subscribeStatement` (no `statement_dump`).

3. **Diffed stable2512-3 against the fix branch:**
   ```
   git diff polkadot-stable2512-3..HEAD -- cumulus/polkadot-omni-node/lib/src/nodes/aura.rs
   ```
   Confirmed the fix adds `node_extra_args` to `start_dev_node` and wires up the
   statement store in the dev code path.

## Problem 1 — Dev mode skips statement store setup (confirmed bug)

**Symptom:** `rpc_methods` does not list `statement_submit` when the node is started
with `--dev-block-time` or `--dev`, even though `--enable-statement-store` is also
passed.

**Root cause (verified in source):** In polkadot-sdk **stable2512-3** (v1.21.3), the
`start_dev_node` function signature is `(config, mode)` — it does **not** accept
`node_extra_args`.  The call site in `command.rs` line 305:

```rust
if let Some(dev_mode) = cli.dev_mode() {
    return node_spec.start_dev_node(config, dev_mode).map_err(Into::into);
}
```

This returns early **before** `node_extra_args` (which carries
`statement_store_config`) is ever used.  The statement store is only wired up in the
`start_node` path (normal parachain consensus mode).

**Result:** `--enable-statement-store` is silently ignored in dev mode.  The statement
store backend is never created, the RPC is never registered, and `statement_submit`
does not appear in `rpc_methods`.

**Fix:** The `shawntabrizi/fix-dev-statement-store` branch on polkadot-sdk adds
`node_extra_args` to the `start_dev_node` signature and wires up the statement store
in the dev path.  Until this is merged and released, statement store RPCs are
**unavailable in dev mode**.

## Problem 2 — No `statement_dump` RPC (RESOLVED)

**Status:** Fixed.  `statement_dump` is available in the polkadot-omni-node
1.21.3 binary (stable2512-3) when the statement store is enabled.  The CLI
`chain statement-dump` and the web Statement Store viewer page both use it
successfully.

**Previous issue:** Earlier testing with mismatched binary versions (e.g.,
`polkadot` 1.15.0 relay + `polkadot-omni-node` 1.21.3 collator) caused the
parachain to stall, making it appear that the RPC was unavailable.  Ensuring
all binaries are from the same SDK release (stable2512-3 / v1.21.3) resolved
this.

## Problem 3 — Solo node without dev mode does not produce blocks

**Symptom:** Running `polkadot-omni-node` without `--dev-block-time` or `--dev` does
not produce blocks (block number stays at 0).

**Root cause:** Without a dev seal mode flag, the omni-node enters normal parachain
consensus.  This requires a relay chain connection to receive slot notifications.
A solo node with no relay chain has no slot source, so no blocks are authored.

**What `--dev-block-time N` does:** Enables manual-seal mode where blocks are
produced at fixed N-millisecond intervals with no relay chain needed.  `--dev` does
the same with a default of 3000 ms.

**Workarounds:**
- For local development: always use `--dev-block-time 3000` (current scripts do this).
- For multi-node testing: use Zombienet, which starts a relay chain + collator.
  The `zombienet.toml` in this repo already configures this with
  `--enable-statement-store`.

## The catch-22

Combining Problems 1 and 3 creates a catch-22 for local testing:

- **With dev mode** (`--dev-block-time`): blocks are produced, but statement store
  RPCs are not registered (Problem 1).
- **Without dev mode**: statement store RPCs would be registered, but blocks are not
  produced without a relay chain (Problem 3).
- **Zombienet**: works (relay chain provides slots, normal code path wires up
  statement store), but is heavier to run than a solo dev node.

Until the `fix-dev-statement-store` SDK fix is merged and released, the only way to
test the statement store locally is via Zombienet.

## Summary of flag interactions (stable2512-3)

| Flag combination | Blocks? | Statement RPCs? | Notes |
|-----------------|---------|-----------------|-------|
| `--dev-block-time 3000 --enable-statement-store` | Yes (manual seal) | **No** (bug) | Current local dev setup — statement store silently skipped |
| `--dev --enable-statement-store` | Yes (manual seal 3s) | **No** (bug) | Same issue |
| `--enable-statement-store` (no dev flags) | No (needs relay) | Yes (if startup completes) | Not usable solo — no blocks |
| `--dev-block-time 3000` (no statement flag) | Yes | No | Statement RPCs absent (expected) |
| Zombienet + `--enable-statement-store` | Yes (relay-driven) | Yes | Only working local option |
