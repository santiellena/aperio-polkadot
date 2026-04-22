import { useState } from "react";
import { stack_template } from "@polkadot-api/descriptors";
import { Binary, FixedSizeBinary } from "polkadot-api";
import { encodeFunctionData, isAddress, type Abi, type Address, type Hex } from "viem";
import { getPublicClient } from "../../config/evm";
import { getStoredEthRpcUrl } from "../../config/network";
import { getClient } from "../../hooks/useChain";
import { useWalletSession } from "../auth/useWalletSession";
import { useSubstrateSession } from "../auth/useSubstrateSession";
import { useChainStore } from "../../store/chainStore";
import { aperioRegistryAbi, getRegistryAddress, shortenAddress } from "../../lib/aperio";

type RoleFunction = "setReviewerRole" | "setContributorRole";

export function MaintainerPanel({
	repoId,
	permissionlessContributions,
	onUpdated,
}: {
	repoId: Hex;
	permissionlessContributions: boolean;
	onUpdated: () => void;
}) {
	const { account, getWalletClientForWrite } = useWalletSession();
	const { browserAccounts, selectedBrowserAccountIndex } = useSubstrateSession();
	const wsUrl = useChainStore((s) => s.wsUrl);
	const substrateAccount = browserAccounts[selectedBrowserAccountIndex] ?? null;

	const [reviewerInput, setReviewerInput] = useState("");
	const [contributorInput, setContributorInput] = useState("");
	const [status, setStatus] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const applyRole = async (fn: RoleFunction, rawAddress: string, enabled: boolean) => {
		const address = rawAddress.trim();
		if (!isAddress(address)) {
			setStatus("Invalid EVM address.");
			return;
		}

		setSubmitting(true);
		setStatus(enabled ? "Granting role..." : "Revoking role...");

		try {
			const publicClient = getPublicClient(getStoredEthRpcUrl());
			const registryAddress = getRegistryAddress();

			if (account) {
				const walletClient = await getWalletClientForWrite();
				if (!walletClient.account) throw new Error("No EVM signer available");

				const hash = await walletClient.writeContract({
					address: registryAddress,
					abi: aperioRegistryAbi,
					functionName: fn,
					args: [repoId, address as Address, enabled],
					account: walletClient.account,
					chain: walletClient.chain,
				});
				await publicClient.waitForTransactionReceipt({ hash });
			} else if (substrateAccount) {
				const calldata = encodeFunctionData({
					abi: aperioRegistryAbi as Abi,
					functionName: fn,
					args: [repoId, address as Address, enabled],
				});
				const api = getClient(wsUrl).getTypedApi(stack_template);
				const tx = api.tx.Revive.call({
					dest: FixedSizeBinary.fromHex(registryAddress),
					value: 0n,
					weight_limit: { ref_time: 500_000_000_000n, proof_size: 5_000_000n },
					storage_deposit_limit: 10_000_000_000_000n,
					data: Binary.fromHex(calldata),
				});
				await new Promise<void>((resolve, reject) => {
					tx.signSubmitAndWatch(substrateAccount.polkadotSigner).subscribe({
						next: (ev) => {
							if (ev.type === "txBestBlocksState" && ev.found) resolve();
						},
						error: reject,
					});
				});
			} else {
				throw new Error("No transaction signer is available");
			}

			const roleLabel = fn === "setReviewerRole" ? "Reviewer" : "Contributor";
			setStatus(
				`${roleLabel} role ${enabled ? "granted to" : "revoked from"} ${shortenAddress(address)}.`,
			);
			onUpdated();
		} catch (cause) {
			setStatus(cause instanceof Error ? cause.message : "Transaction failed");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<section className="card space-y-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="section-title">Maintainer Settings</h2>
					<p className="mt-1 text-sm text-text-secondary">
						Manage roles for this repository. Only the maintainer can grant or revoke
						access.
					</p>
				</div>
				<span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
					Maintainer only
				</span>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<RoleManager
					title="Reviewer Role"
					description="Reviewers can approve or reject open proposals."
					value={reviewerInput}
					onChange={setReviewerInput}
					onGrant={() => void applyRole("setReviewerRole", reviewerInput, true)}
					onRevoke={() => void applyRole("setReviewerRole", reviewerInput, false)}
					disabled={submitting}
				/>

				{!permissionlessContributions ? (
					<RoleManager
						title="Contributor Role"
						description="Contributors can submit proposals. Not needed when contributions are open to everyone."
						value={contributorInput}
						onChange={setContributorInput}
						onGrant={() => void applyRole("setContributorRole", contributorInput, true)}
						onRevoke={() =>
							void applyRole("setContributorRole", contributorInput, false)
						}
						disabled={submitting}
					/>
				) : (
					<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4 text-sm text-text-secondary">
						<div className="font-medium text-text-primary">Contributor Role</div>
						<p className="mt-1">
							This repository allows permissionless contributions — any address can
							submit proposals without a whitelist.
						</p>
					</div>
				)}
			</div>

			{status ? (
				<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-text-secondary break-all">
					{status}
				</div>
			) : null}
		</section>
	);
}

function RoleManager({
	title,
	description,
	value,
	onChange,
	onGrant,
	onRevoke,
	disabled,
}: {
	title: string;
	description: string;
	value: string;
	onChange: (v: string) => void;
	onGrant: () => void;
	onRevoke: () => void;
	disabled: boolean;
}) {
	return (
		<div className="space-y-3">
			<div>
				<div className="text-sm font-medium text-text-primary">{title}</div>
				<p className="mt-0.5 text-xs text-text-tertiary">{description}</p>
			</div>
			<input
				type="text"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder="0x..."
				className="input-field w-full font-mono"
			/>
			<div className="flex gap-2">
				<button
					onClick={onGrant}
					disabled={disabled || !value.trim()}
					className="btn-primary flex-1 disabled:opacity-50"
				>
					Grant
				</button>
				<button
					onClick={onRevoke}
					disabled={disabled || !value.trim()}
					className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50 flex-1"
				>
					Revoke
				</button>
			</div>
		</div>
	);
}
