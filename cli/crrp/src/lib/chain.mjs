import { createClient, Binary, FixedSizeBinary, Enum } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";

export { Binary, FixedSizeBinary, Enum };

const clients = new Map();

export function getClient(wsUrl) {
  let client = clients.get(wsUrl);
  if (!client) {
    client = createClient(withPolkadotSdkCompat(getWsProvider(wsUrl)));
    clients.set(wsUrl, client);
  }
  return client;
}

export function destroyAllClients() {
  for (const client of clients.values()) {
    try {
      client.destroy();
    } catch {
      // best effort
    }
  }
  clients.clear();
}

/**
 * Submit a PAPI transaction and resolve when it enters a best block.
 * Rejects with a descriptive error if the runtime reports a dispatch failure
 * or if the transaction is rejected by the pool (fees, nonce, etc.).
 */
export function submitAndWait(tx, signer) {
  return new Promise((resolve, reject) => {
    const subscription = tx.signSubmitAndWatch(signer).subscribe({
      next: (ev) => {
        const landed =
          (ev.type === "txBestBlocksState" && ev.found === true) || ev.type === "finalized";
        if (!landed) return;
        subscription.unsubscribe();
        if (ev.ok) {
          resolve(ev);
          return;
        }
        reject(new Error(describeDispatchError(ev)));
      },
      error: (err) => {
        subscription.unsubscribe();
        reject(new Error(describeSubmitError(err)));
      },
    });
  });
}

function describeDispatchError(ev) {
  const de = ev.dispatchError;
  if (!de) return `Transaction failed (type=${ev.type}, no dispatchError)`;
  if (de.type === "Module" && de.value) {
    const m = de.value;
    const inner = m.value && typeof m.value === "object" ? m.value.type : undefined;
    return `Dispatch error: ${m.type}.${inner ?? "Unknown"}`;
  }
  return `Dispatch error: ${de.type}${de.value ? ` (${JSON.stringify(de.value)})` : ""}`;
}

// PAPI throws structured validity errors (not Error instances) when the pool
// rejects an extrinsic. Unwrap the common shapes into a readable message.
function describeSubmitError(err) {
  if (!err) return "Transaction submission failed (no error details).";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const outerType = err.type;
    const innerType = err.value?.type ?? err.value;
    if (outerType === "Invalid" && innerType === "Payment") {
      return (
        "Transaction rejected: Invalid/Payment. The signer account can't pay fees — " +
        "fund it with Paseo tokens on Asset Hub Paseo (or set CRRP_SIGNER_SURI to a funded key)."
      );
    }
    if (outerType === "Invalid" && innerType === "BadProof") {
      return "Transaction rejected: Invalid/BadProof. Signature did not verify.";
    }
    if (outerType === "Invalid" && typeof innerType === "string") {
      return `Transaction rejected: Invalid/${innerType}.`;
    }
    if (outerType === "Unknown" && typeof innerType === "string") {
      return `Transaction rejected: Unknown/${innerType}.`;
    }
    return `Transaction submission failed: ${JSON.stringify(err)}`;
  }
  return `Transaction submission failed: ${String(err)}`;
}
