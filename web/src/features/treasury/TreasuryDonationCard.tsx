import { useState } from "react";
import { parseEther } from "viem";
import { crrpTreasuryAbi, formatEthAmount, shortenAddress } from "../../lib/crrp";
import { useWalletSession } from "../auth/useWalletSession";
import type { Address, Hex } from "viem";

export function TreasuryDonationCard({
	repoId,
	treasuryAddress,
	balance,
	contributionReward,
	reviewReward,
	totalClaimable,
	unfundedClaimable,
	onDonated,
}: {
	repoId: Hex;
	treasuryAddress: Address | null;
	balance: bigint | null;
	contributionReward: bigint | null;
	reviewReward: bigint | null;
	totalClaimable: bigint | null;
	unfundedClaimable: bigint | null;
	onDonated: () => Promise<void> | void;
}) {
	const {
		account,
		sourceLabel,
		canUseBrowserWallet,
		canUseDevSigner,
		connectBrowserWallet,
		devAccountIndex,
		selectDevAccount,
		getWalletClientForWrite,
	} = useWalletSession();
	const [amount, setAmount] = useState("0.1");
	const [status, setStatus] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const treasuryReady = Boolean(treasuryAddress);

	const submitDonation = async () => {
		if (!treasuryAddress) {
			return;
		}

		setSubmitting(true);
		setStatus(null);
		try {
			const walletClient = await getWalletClientForWrite();
			const [fromAccount] = await walletClient.getAddresses();
			const hash = await walletClient.writeContract({
				address: treasuryAddress,
				abi: crrpTreasuryAbi,
				functionName: "donate",
				args: [repoId],
				value: parseEther(amount),
				account: fromAccount,
				chain: walletClient.chain,
			});

			setStatus(`Donation submitted: ${hash}`);
			await onDonated();
		} catch (cause) {
			setStatus(cause instanceof Error ? cause.message : "Donation failed");
		} finally {
			setSubmitting(false);
		}
	};

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
				<ValueBlock label="Contributor Reward" value={formatEthAmount(contributionReward)} />
				<ValueBlock label="Reviewer Reward" value={formatEthAmount(reviewReward)} />
				<ValueBlock label="Unfunded Claimable" value={formatEthAmount(unfundedClaimable)} />
				<ValueBlock label="Current Signer" value={account ? `${sourceLabel}: ${shortenAddress(account)}` : "Not connected"} />
			</div>

			{canUseBrowserWallet ? (
				<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 flex flex-wrap items-center gap-3">
					<button onClick={() => void connectBrowserWallet()} className="btn-secondary">
						Connect Browser Wallet
					</button>
					<span className="text-xs text-text-secondary">
						Use an injected wallet when running in the browser or inside dot.li.
					</span>
				</div>
			) : canUseDevSigner ? (
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
					<span className="text-xs text-text-secondary">
						Used as a local fallback when no injected wallet is available.
					</span>
				</div>
			) : (
				<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-xs text-text-secondary">
					No injected wallet was detected in this browser. Treasury donations require a
					browser wallet in hosted environments.
				</div>
			)}

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
