import { useState } from "react";
import { encodeFunctionData, keccak256, parseEther, type Abi } from "viem";
import { Binary, FixedSizeBinary } from "polkadot-api";
import { stack_template } from "@polkadot-api/descriptors";
import { aperioTreasuryAbi, formatEthAmount, shortenAddress } from "../../lib/aperio";
import { useWalletSession } from "../auth/useWalletSession";
import { useSubstrateSession } from "../auth/useSubstrateSession";
import { getClient } from "../../hooks/useChain";
import { useChainStore } from "../../store/chainStore";
import { getPublicClient } from "../../config/evm";
import { getStoredEthRpcUrl } from "../../config/network";
import type { Address, Hex } from "viem";

export function TreasuryDonationCard({
	repoId,
	treasuryAddress,
	balance,
	contributionReward,
	reviewReward,
	totalClaimable,
	unfundedClaimable,
	userClaimable,
	canClaimRewards,
	onDonated,
}: {
	repoId: Hex;
	treasuryAddress: Address | null;
	balance: bigint | null;
	contributionReward: bigint | null;
	reviewReward: bigint | null;
	totalClaimable: bigint | null;
	unfundedClaimable: bigint | null;
	userClaimable: bigint | null;
	canClaimRewards: boolean;
	onDonated: () => Promise<void> | void;
}) {
	const {
		account,
		sourceLabel,
		canUseDevSigner,
		devAccountIndex,
		selectDevAccount,
		getWalletClientForWrite,
	} = useWalletSession();
	const {
		browserAccounts,
		selectedBrowserAccountIndex,
		availableWallets,
		connectBrowserWallet: connectSubstrateWallet,
	} = useSubstrateSession();
	const wsUrl = useChainStore((s) => s.wsUrl);

	const substrateAccount = browserAccounts[selectedBrowserAccountIndex] ?? null;
	const substrateH160: `0x${string}` | null = substrateAccount
		? (`0x${keccak256(substrateAccount.polkadotSigner.publicKey).slice(-40)}` as `0x${string}`)
		: null;

	const [amount, setAmount] = useState("0.1");
	const [status, setStatus] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const treasuryReady = Boolean(treasuryAddress) && Boolean(account || substrateH160);
	const claimReady =
		Boolean(treasuryAddress) && Boolean(account || substrateAccount) && Boolean(userClaimable && userClaimable > 0n);

	const execTreasuryWrite = async (opts: {
		functionName: "donate" | "claim";
		args: [Hex];
		value?: bigint;
	}) => {
		if (!treasuryAddress) {
			throw new Error("Treasury not configured");
		}

		if (account) {
			const walletClient = await getWalletClientForWrite();
			const hash = await walletClient.writeContract({
				address: treasuryAddress,
				abi: aperioTreasuryAbi,
				functionName: opts.functionName,
				args: opts.args,
				value: opts.value,
				account: walletClient.account as unknown as Address,
				chain: walletClient.chain,
			});
			const publicClient = getPublicClient(getStoredEthRpcUrl());
			await publicClient.waitForTransactionReceipt({ hash });
			return hash;
		}

		if (substrateAccount) {
			const calldata = encodeFunctionData({
				abi: aperioTreasuryAbi as Abi,
				functionName: opts.functionName,
				args: opts.args,
			});
			const api = getClient(wsUrl).getTypedApi(stack_template);
			const tx = api.tx.Revive.call({
				dest: FixedSizeBinary.fromHex(treasuryAddress),
				value: opts.value ?? 0n,
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
			return null;
		}

		throw new Error("No transaction signer is available");
	};

	const submitDonation = async () => {
		if (!treasuryAddress) return;

		setSubmitting(true);
		setStatus(null);
		try {
			const value = parseEther(amount);
			const hash = await execTreasuryWrite({
				functionName: "donate",
				args: [repoId],
				value,
			});
			setStatus(hash ? `Donation submitted: ${hash}` : "Donation submitted.");

			await onDonated();
		} catch (cause) {
			setStatus(cause instanceof Error ? cause.message : "Donation failed");
		} finally {
			setSubmitting(false);
		}
	};

	const submitClaim = async () => {
		if (!treasuryAddress) return;

		setSubmitting(true);
		setStatus(null);
		try {
			const hash = await execTreasuryWrite({
				functionName: "claim",
				args: [repoId],
			});
			setStatus(hash ? `Claim submitted: ${hash}` : "Claim submitted.");
			await onDonated();
		} catch (cause) {
			setStatus(cause instanceof Error ? cause.message : "Claim failed");
		} finally {
			setSubmitting(false);
		}
	};

	const signerLabel = account
		? `${sourceLabel}: ${shortenAddress(account)}`
		: substrateH160
			? `Substrate: ${shortenAddress(substrateH160)}`
			: "Not connected";

	return (
		<section className="card space-y-4">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="section-title">Treasury</h2>
					<p className="text-sm text-text-secondary mt-1">
						Repository donations fund contributor and reviewer rewards. This is the only
						write flow exposed in the current MVP.
					</p>
				</div>
				<div className="text-right text-xs text-text-tertiary">
					<div>Treasury</div>
					<div className="mt-1 font-mono text-text-secondary">
						{treasuryAddress ? shortenAddress(treasuryAddress) : "Not configured"}
					</div>
				</div>
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				<ValueBlock label="Balance" value={formatEthAmount(balance)} />
				<ValueBlock label="Total Claimable" value={formatEthAmount(totalClaimable)} />
				<ValueBlock label="Your Claimable" value={formatEthAmount(userClaimable)} />
				<ValueBlock label="Contributor Reward" value={formatEthAmount(contributionReward)} />
				<ValueBlock label="Reviewer Reward" value={formatEthAmount(reviewReward)} />
				<ValueBlock label="Unfunded Claimable" value={formatEthAmount(unfundedClaimable)} />
				<ValueBlock label="Current Signer" value={signerLabel} />
			</div>

			{canUseDevSigner ? (
				<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 flex flex-wrap items-center gap-3">
					<label className="text-xs uppercase tracking-[0.18em] text-text-muted">
						Dev Signer
					</label>
					<select
						value={devAccountIndex}
						onChange={(event) => selectDevAccount(Number(event.target.value))}
						className="input-field"
					>
						<option value={0}>Alice</option>
						<option value={1}>Bob</option>
						<option value={2}>Charlie</option>
					</select>
				</div>
			) : !account && browserAccounts.length === 0 && availableWallets.length > 0 ? (
				<div className="flex flex-wrap gap-2">
					{availableWallets.map((walletName) => (
						<button
							key={walletName}
							onClick={() => void connectSubstrateWallet(walletName)}
							className="btn-secondary"
						>
							Connect {walletName}
						</button>
					))}
				</div>
			) : !account && !substrateH160 ? (
				<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-text-secondary">
					No wallet detected. Connect a wallet via the Config page.
				</div>
			) : null}

			{canClaimRewards ? (
				<div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-text-secondary">
					Claiming uses the treasury contract's single per-repository balance for your
					address, so if you earned both contributor and reviewer rewards they will be
					claimed together in one transaction.
				</div>
			) : null}

			<div className="flex flex-col gap-3 md:flex-row md:items-end">
				<div className="flex-1">
					<label className="label">Donation Amount</label>
					<input
						type="text"
						value={amount}
						onChange={(event) => setAmount(event.target.value)}
						placeholder="0.1"
						className="input-field w-full"
					/>
				</div>
				<button
					onClick={() => void submitDonation()}
					disabled={!treasuryReady || submitting}
					className="btn-primary md:min-w-44"
				>
					{submitting ? "Submitting..." : "Donate"}
				</button>
				<button
					onClick={() => void submitClaim()}
					disabled={!claimReady || submitting || !canClaimRewards}
					className="btn-secondary md:min-w-44 disabled:opacity-50"
				>
					{submitting ? "Submitting..." : `Claim ${formatEthAmount(userClaimable)}`}
				</button>
			</div>

			{status ? (
				<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-text-secondary break-all">
					{status}
				</div>
			) : null}
		</section>
	);
}

function ValueBlock({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
			<div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{label}</div>
			<div className="mt-1 text-sm font-mono text-text-primary break-all">{value}</div>
		</div>
	);
}
