import { useState, useEffect } from "react";
import { keccak256 } from "viem";
import { FixedSizeBinary } from "polkadot-api";
import type { InjectedPolkadotAccount } from "polkadot-api/pjs-signer";
import { getClient } from "../hooks/useChain";
import { stack_template } from "@polkadot-api/descriptors";
import { useChainStore } from "../store/chainStore";

type MappingStatus = "idle" | "checking" | "mapped" | "unmapped" | "mapping" | "error";

// Derives the H160 EVM address from a 32-byte Substrate public key.
// The runtime uses keccak256(publicKey)[12:32] for unmapped accounts.
// Registering via map_account activates this address on-chain.
// Reference: https://docs.polkadot.com/smart-contracts/for-eth-devs/accounts/#polkadot-to-ethereum-mapping
function deriveH160(publicKey: Uint8Array): `0x${string}` {
	const hash = keccak256(publicKey);
	return `0x${hash.slice(-40)}` as `0x${string}`;
}

export function MapAccountButton({ account }: { account: InjectedPolkadotAccount }) {
	const wsUrl = useChainStore((s) => s.wsUrl);
	const [status, setStatus] = useState<MappingStatus>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const h160 = deriveH160(account.polkadotSigner.publicKey);
	const shortH160 = `${h160.slice(0, 8)}…${h160.slice(-4)}`;

	useEffect(() => {
		let cancelled = false;

		async function checkMapping() {
			setStatus("checking");
			setErrorMessage(null);
			try {
				const api = getClient(wsUrl).getTypedApi(stack_template);
				const info = await api.query.Revive.AccountInfoOf.getValue(
					FixedSizeBinary.fromHex(h160),
				);
				if (!cancelled) setStatus(info !== undefined ? "mapped" : "unmapped");
			} catch {
				if (!cancelled) setStatus("error");
			}
		}

		void checkMapping();
		return () => {
			cancelled = true;
		};
	}, [account.address, wsUrl, h160]);

	async function handleMap() {
		setStatus("mapping");
		setErrorMessage(null);
		try {
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const tx = api.tx.Revive.map_account();
			await new Promise<void>((resolve, reject) => {
				tx.signSubmitAndWatch(account.polkadotSigner).subscribe({
					next: (ev) => {
						if (ev.type === "txBestBlocksState" && ev.found) resolve();
					},
					error: reject,
				});
			});
			setStatus("mapped");
		} catch (e) {
			setStatus("unmapped");
			setErrorMessage(e instanceof Error ? e.message : "Mapping failed");
		}
	}

	if (status === "checking") {
		return (
			<div className="min-w-[136px] max-w-[164px] rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-1.5">
				<div className="panel-label">EVM Address</div>
				<div className="mt-0.5 truncate text-xs text-text-tertiary">Checking…</div>
			</div>
		);
	}

	if (status === "mapping") {
		return (
			<div className="min-w-[136px] max-w-[164px] rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-1.5">
				<div className="panel-label">EVM Address</div>
				<div className="mt-0.5 truncate text-xs text-text-tertiary">Mapping account…</div>
			</div>
		);
	}

	if (status === "mapped") {
		return (
			<div className="min-w-[136px] max-w-[164px] rounded-xl border border-teal-500/20 bg-teal-500/5 px-2 py-1.5">
				<div className="panel-label">EVM Address</div>
				<div className="mt-0.5 truncate font-mono text-text-primary">{shortH160}</div>
				<div className="mt-0.5 text-[10px] text-teal-400">Mapped</div>
			</div>
		);
	}

	return (
		<div className="min-w-[136px] max-w-[164px] rounded-xl border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 space-y-1.5">
			<div className="panel-label">EVM Address</div>
			<div className="truncate font-mono text-text-primary">{shortH160}</div>
			<button
				onClick={() => void handleMap()}
				className="w-full rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-300 transition-colors hover:bg-amber-500/30"
			>
				Map Account
			</button>
			{errorMessage && (
				<div className="break-all text-[10px] text-red-400">{errorMessage}</div>
			)}
		</div>
	);
}
