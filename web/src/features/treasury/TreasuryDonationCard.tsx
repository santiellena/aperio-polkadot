import { useState } from "react";
import { encodeFunctionData, keccak256, parseEther, parseUnits, type Abi } from "viem";
import { Binary, FixedSizeBinary } from "polkadot-api";
import { stack_template } from "@polkadot-api/descriptors";
import { aperioTreasuryAbi, formatEthAmount, shortenAddress } from "../../lib/aperio";
import { useWalletSession } from "../auth/useWalletSession";
import { useSubstrateSession } from "../auth/useSubstrateSession";
import { getClient } from "../../hooks/useChain";
import { useChainStore } from "../../store/chainStore";
import { getPublicClient } from "../../config/evm";
import { getStoredEthRpcUrl } from "../../config/network";
import { formatDispatchError } from "../../utils/format";
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
	const [failureDetails, setFailureDetails] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const treasuryReady = Boolean(treasuryAddress) && Boolean(account || substrateH160);
	const claimReady =
		Boolean(treasuryAddress) && Boolean(account || substrateAccount) && Boolean(userClaimable && userClaimable > 0n);

	const readRepoTreasuryBalance = async () => {
		if (!treasuryAddress) {
			throw new Error("Treasury not configured");
		}
		return (await getPublicClient(getStoredEthRpcUrl()).readContract({
			address: treasuryAddress,
			abi: aperioTreasuryAbi,
			functionName: "getRepoBalance",
			args: [repoId],
		})) as bigint;
	};

	const ensureSubstrateSignerCanCoverDonation = async (value: bigint) => {
		if (!substrateAccount || value <= 0n) {
			return null;
		}
		const api = getClient(wsUrl).getTypedApi(stack_template);
		const accountInfo = await api.query.System.Account.getValue(substrateAccount.address);
		if (accountInfo.data.free < value) {
			throw new Error(
				`The connected Substrate account does not have enough free PAS to attach ${amount} to donate(repoId)`,
			);
		}
		return accountInfo.data.free;
	};

	const normalizeTreasuryError = (cause: unknown) => {
		const message = cause instanceof Error ? cause.message : String(cause);
		if (message.includes("Revive.TransferFailed") || message.includes("TransferFailed")) {
			return "The payable value attached to donate(repoId) could not be transferred from the connected Substrate account. This is not a plain wallet transfer; the contract call failed before donate(repoId) executed.";
		}
		return message;
	};

	const buildFailureDetails = (params: {
		action: "donate" | "claim";
		value?: bigint;
		cause: unknown;
		freeBalance?: bigint | null;
		balanceBefore?: bigint | null;
		balanceAfter?: bigint | null;
	}) =>
		[
			`action=${params.action}`,
			`signer_mode=${account ? "evm-wallet" : substrateAccount ? "substrate-revive" : "none"}`,
			`signer=${account ?? substrateAccount?.address ?? "none"}`,
			`mapped_h160=${substrateH160 ?? "n/a"}`,
			`treasury=${treasuryAddress ?? "n/a"}`,
			`repo_id=${repoId}`,
			`ui_amount=${params.action === "donate" ? amount : "n/a"}`,
			`attached_value=${params.value?.toString() ?? "0"}`,
			`substrate_free_balance=${params.freeBalance?.toString() ?? "n/a"}`,
			`repo_balance_before=${params.balanceBefore?.toString() ?? "n/a"}`,
			`repo_balance_after=${params.balanceAfter?.toString() ?? "n/a"}`,
			`error=${normalizeTreasuryError(params.cause)}`,
			`raw_error=${params.cause instanceof Error ? params.cause.message : String(params.cause)}`,
		].join("\n");

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
			const hash =
				opts.functionName === "donate"
					? await walletClient.writeContract({
						address: treasuryAddress,
						abi: aperioTreasuryAbi,
						functionName: "donate",
						args: opts.args,
						value: opts.value ?? 0n,
						account: walletClient.account as unknown as Address,
						chain: walletClient.chain,
					})
					: await walletClient.writeContract({
						address: treasuryAddress,
						abi: aperioTreasuryAbi,
						functionName: "claim",
						args: opts.args,
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
				const subscription = tx.signSubmitAndWatch(substrateAccount.polkadotSigner).subscribe({
					next: (ev) => {
						const landed =
							(ev.type === "txBestBlocksState" && ev.found === true) || ev.type === "finalized";
						if (!landed) return;
						subscription.unsubscribe();
						if (ev.ok) {
							resolve();
							return;
						}
						console.error("Treasury Revive.call failed", {
							functionName: opts.functionName,
							repoId: opts.args[0],
							treasuryAddress,
							value: opts.value ?? 0n,
							event: ev,
						});
						reject(
							new Error(
								`Revive.call ${opts.functionName} failed: ${formatDispatchError(ev.dispatchError)} (event=${ev.type})`,
							),
						);
					},
					error: (cause) => {
						subscription.unsubscribe();
						console.error("Treasury Revive.call submission error", {
							functionName: opts.functionName,
							repoId: opts.args[0],
							treasuryAddress,
							value: opts.value ?? 0n,
							cause,
						});
						reject(cause);
					},
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
		setFailureDetails(null);
		let value = 0n;
		let freeBalance: bigint | null = null;
		let balanceBefore: bigint | null = null;
		let balanceAfter: bigint | null = null;
		try {
			value = account ? parseEther(amount) : parseUnits(amount, 12);
			freeBalance = await ensureSubstrateSignerCanCoverDonation(value);
			balanceBefore = await readRepoTreasuryBalance();
			const hash = await execTreasuryWrite({
				functionName: "donate",
				args: [repoId],
				value,
			});
			balanceAfter = await readRepoTreasuryBalance();
			if (balanceAfter <= balanceBefore) {
				throw new Error(
					"Donation transaction did not update the repository treasury balance via donate(repoId)",
				);
			}
			setStatus(hash ? `Donation submitted: ${hash}` : "Donation submitted.");
			setFailureDetails(null);

			await onDonated();
		} catch (cause) {
			console.error("Treasury donation failed", {
				repoId,
				treasuryAddress,
				account,
				substrateAccount: substrateAccount?.address ?? null,
				mappedH160: substrateH160,
				inputAmount: amount,
				attachedValue: value,
				freeBalance,
				balanceBefore,
				balanceAfter,
				cause,
			});
			setStatus(normalizeTreasuryError(cause) || "Donation failed");
			setFailureDetails(
				buildFailureDetails({
					action: "donate",
					value,
					cause,
					freeBalance,
					balanceBefore,
					balanceAfter,
				}),
			);
		} finally {
			setSubmitting(false);
		}
	};

	const submitClaim = async () => {
		if (!treasuryAddress) return;

		setSubmitting(true);
		setStatus(null);
		setFailureDetails(null);
		let freeBalance: bigint | null = null;
		try {
			if (substrateAccount) {
				const api = getClient(wsUrl).getTypedApi(stack_template);
				freeBalance = (await api.query.System.Account.getValue(substrateAccount.address)).data.free;
			}
			const hash = await execTreasuryWrite({
				functionName: "claim",
				args: [repoId],
			});
			setStatus(hash ? `Claim submitted: ${hash}` : "Claim submitted.");
			setFailureDetails(null);
			await onDonated();
		} catch (cause) {
			console.error("Treasury claim failed", {
				repoId,
				treasuryAddress,
				account,
				substrateAccount: substrateAccount?.address ?? null,
				mappedH160: substrateH160,
				freeBalance,
				cause,
			});
			setStatus(normalizeTreasuryError(cause) || "Claim failed");
			setFailureDetails(
				buildFailureDetails({
					action: "claim",
					cause,
					freeBalance,
				}),
			);
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
					<p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-text-secondary">
						On PASEO, donations can take a while to show up in the repository treasury
						balance. The transaction may land first and the UI impact may appear shortly
						after.
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

			{failureDetails ? (
				<pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-text-secondary">
					{failureDetails}
				</pre>
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
