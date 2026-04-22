/// Format a PAPI dispatch error into a human-readable string.
export function formatDispatchError(err: unknown): string {
	if (!err) return "Transaction failed";
	if (err instanceof Error) {
		const message = err.message.trim();
		if (!message) return "Transaction failed";
		if (message.startsWith("{")) {
			try {
				return formatDispatchError(JSON.parse(message));
			} catch {
				return message;
			}
		}
		return message;
	}

	const e = err as { type?: string; value?: { type?: string; value?: { type?: string } } };
	if (e.type === "Module" && e.value) {
		const mod = e.value;
		return `${mod.type}.${mod.value?.type ?? ""}`.replace(/:?\s*$/, "");
	}
	if (e.type === "Invalid" && e.value?.type === "Payment") {
		return "The signer cannot pay the transaction fee or required deposit. Fund this account with PAS and try again.";
	}
	if (e.type === "Invalid" && e.value?.type) {
		return `Invalid transaction: ${e.value.type}`;
	}
	if (e.type === "Unknown" && e.value?.type) {
		return `Transaction rejected: ${e.value.type}`;
	}
	return JSON.stringify(err);
}
