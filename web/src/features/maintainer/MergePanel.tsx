import { useEffect, useState } from "react";
import { asset_hub_paseo } from "@polkadot-api/descriptors";
import { Binary, FixedSizeBinary } from "polkadot-api";
import { encodeFunctionData, type Abi, type Hex } from "viem";
import { getPublicClient } from "../../config/evm";
import { getStoredEthRpcUrl } from "../../config/network";
import { useSubstrateSession } from "../auth/useSubstrateSession";
import { useWalletSession } from "../auth/useWalletSession";
import { checkBulletinAuthorization, uploadToBulletin } from "../../hooks/useBulletin";
import { getClient } from "../../hooks/useChain";
import {
	buildBundleUrl,
	aperioRegistryAbi,
	formatGitCommitHash,
	getRegistryAddress,
	gitCommitHashToBytes32,
	shortenAddress,
} from "../../lib/aperio";
import { useChainStore } from "../../store/chainStore";
import { hexHashToCid } from "../../utils/cid";
import { hashFileWithBytes } from "../../utils/hash";

type AuthorizationState = "idle" | "checking" | "authorized" | "unauthorized";

export function MergePanel({
	repoId,
	proposalId,
	proposedCommit,
	proposedCid,
	canMerge,
	onMerged,
}: {
	repoId: Hex;
	proposalId: number;
	proposedCommit: Hex;
	proposedCid: string;
	canMerge: boolean;
	onMerged: () => void;
}) {
	const { account, getWalletClientForWrite } = useWalletSession();
	const {
		selectedSource: substrateSource,
		setSelectedSource: setSubstrateSource,
		canUseDevSigner: canUseDevSubstrateSigner,
		devAccountIndex: substrateDevAccountIndex,
		setDevAccountIndex: setSubstrateDevAccountIndex,
		devAccounts: substrateDevAccounts,
		hostStatus,
		availableWallets,
		browserAccounts,
		browserSourceLabel,
		selectedBrowserAccountIndex,
		setSelectedBrowserAccountIndex,
		connectBrowserWallet: connectSubstrateWallet,
		getBulletinSigner,
	} = useSubstrateSession();
	const wsUrl = useChainStore((s) => s.wsUrl);
	const substrateAccount = browserAccounts[selectedBrowserAccountIndex] ?? null;

	const [open, setOpen] = useState(false);
	const [finalCommit, setFinalCommit] = useState("");
	const [cidMode, setCidMode] = useState<"direct" | "upload">("direct");
	const [directCid, setDirectCid] = useState("");
	const [bundleName, setBundleName] = useState<string | null>(null);
	const [bundleBytes, setBundleBytes] = useState<Uint8Array | null>(null);
	const [bundleHash, setBundleHash] = useState<`0x${string}` | null>(null);
	const [bundleCid, setBundleCid] = useState<string | null>(null);
	const [authorizationState, setAuthorizationState] = useState<AuthorizationState>("idle");
	const [authorizationMessage, setAuthorizationMessage] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (proposedCommit) {
			setFinalCommit(formatGitCommitHash(proposedCommit));
		}
	}, [proposedCommit]);

	useEffect(() => {
		if (cidMode !== "upload") return;
		let cancelled = false;

		async function checkAuth() {
			if (!bundleBytes) {
				setAuthorizationState("idle");
				setAuthorizationMessage(null);
				return;
			}
			setAuthorizationState("checking");
			setAuthorizationMessage(null);
			try {
				const { address, sourceLabel: signerSourceLabel } = await getBulletinSigner();
				const authorized = await checkBulletinAuthorization(address, bundleBytes.length);
				if (cancelled) return;
				if (authorized) {
					setAuthorizationState("authorized");
					setAuthorizationMessage(
						`${shortenAddress(address)} authorized via ${signerSourceLabel}.`,
					);
					return;
				}
				setAuthorizationState("unauthorized");
				setAuthorizationMessage(
					`${shortenAddress(address)} not authorized to store ${bundleBytes.length} bytes.`,
				);
			} catch (cause) {
				if (cancelled) return;
				setAuthorizationState("unauthorized");
				setAuthorizationMessage(
					cause instanceof Error ? cause.message : "Bulletin signer unavailable",
				);
			}
		}

		void checkAuth();
		return () => {
			cancelled = true;
		};
	}, [bundleBytes, getBulletinSigner, cidMode]);

	const handleBundleSelected = async (file: File | undefined) => {
		if (!file) return;
		setStatus(null);
		setBundleName(file.name);
		const { hash, bytes } = await hashFileWithBytes(file);
		setBundleBytes(bytes);
		setBundleHash(hash);
		setBundleCid(hexHashToCid(hash));
	};

	const submitMerge = async () => {
		try {
			setSubmitting(true);
			setStatus(null);

			const registryAddress = getRegistryAddress();

			if (!finalCommit.trim()) {
				throw new Error("Enter the final canonical commit hash");
			}
			if (cidMode === "upload") {
				if (!bundleBytes || !bundleCid) {
					throw new Error("Select the merged bundle file");
				}
				if (!bundleName?.toLowerCase().endsWith(".bundle")) {
					throw new Error("The artifact must be a .bundle file");
				}
			} else {
				if (!directCid.trim()) {
					throw new Error("Enter the merged bundle CID");
				}
			}

			const effectiveCid = cidMode === "direct" ? directCid.trim() : bundleCid!;
			const finalCommitBytes32 = gitCommitHashToBytes32(finalCommit.trim());

			if (cidMode === "upload") {
				setStatus("Checking Bulletin authorization...");
				const {
					address: bulletinAddress,
					signer: bulletinSigner,
					sourceLabel: bulletinSourceLabel,
				} = await getBulletinSigner();
				const authorized = await checkBulletinAuthorization(
					bulletinAddress,
					bundleBytes!.length,
				);
				if (!authorized) {
					throw new Error(
						`Bulletin signer not authorized to upload ${bundleBytes!.length} bytes`,
					);
				}
				setStatus(`Uploading ${bundleName} to Bulletin via ${bulletinSourceLabel}...`);
				await uploadToBulletin(bundleBytes!, bulletinSigner);
			}

			const publicClient = getPublicClient(getStoredEthRpcUrl());
			setStatus("Submitting merge transaction...");
			if (account) {
				const walletClient = await getWalletClientForWrite();
				if (!walletClient.account) throw new Error("No EVM signer available");

				const txHash = await walletClient.writeContract({
					address: registryAddress,
					abi: aperioRegistryAbi,
					functionName: "mergeProposal",
					args: [repoId, BigInt(proposalId), finalCommitBytes32, effectiveCid],
					account: walletClient.account,
					chain: walletClient.chain,
				});
				await publicClient.waitForTransactionReceipt({ hash: txHash });
			} else if (substrateAccount) {
				const calldata = encodeFunctionData({
					abi: aperioRegistryAbi as Abi,
					functionName: "mergeProposal",
					args: [repoId, BigInt(proposalId), finalCommitBytes32, effectiveCid],
				});
				const api = getClient(wsUrl).getTypedApi(asset_hub_paseo);
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

			setStatus("Merged.");
			onMerged();
		} catch (cause) {
			setStatus(cause instanceof Error ? cause.message : "Merge failed");
		} finally {
			setSubmitting(false);
		}
	};

	const proposedBundleUrl = buildBundleUrl(proposedCid);
	const shortId = `proposal-${proposalId}`;

	return (
		<div className="border-t border-white/[0.06] pt-3">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex items-center gap-2 text-sm font-medium text-amber-300 hover:text-amber-200 transition-colors"
			>
				<span>{open ? "▾" : "▸"}</span>
				Maintainer Actions
				{canMerge ? (
					<span className="ml-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-300">
						Ready to merge
					</span>
				) : null}
			</button>

			{open ? (
				<div className="mt-4 space-y-4">
					{/* Proposed bundle info + commands */}
					<div className="space-y-3">
						<div className="text-sm font-medium text-text-primary">Proposed Bundle</div>
						<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 space-y-2 text-sm">
							<div>
								<div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
									Proposed Commit
								</div>
								<div className="mt-1 break-all font-mono text-text-primary">
									{formatGitCommitHash(proposedCommit)}
								</div>
							</div>
							<div>
								<div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
									Proposed CID
								</div>
								<div className="mt-1 break-all font-mono text-text-primary">
									{proposedCid}
								</div>
							</div>
						</div>
						<pre className="rounded-lg border border-white/[0.06] bg-black/20 p-3 text-xs text-text-primary overflow-x-auto">
							{[
								`# Fetch the proposed bundle`,
								`curl -L "${proposedBundleUrl ?? `<gateway>/${proposedCid}`}" \\`,
								`  -o ${shortId}.bundle`,
								``,
								`# Verify bundle integrity`,
								`git bundle verify ${shortId}.bundle`,
								``,
								`# Clone to a new directory for review`,
								`git clone ${shortId}.bundle ${shortId}`,
								`cd ${shortId}`,
								`git branch -a`,
								`git checkout main`,
								``,
								`# Or fetch into your existing repo`,
								`git fetch ../${shortId}.bundle HEAD:refs/heads/${shortId}`,
								`git diff HEAD..${shortId} --stat`,
							].join("\n")}
						</pre>
					</div>

					{/* Merge form — only when eligible */}
					{canMerge ? (
						<div className="space-y-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
							<div>
								<div className="text-sm font-medium text-emerald-300">
									Merge This Proposal
								</div>
								<p className="mt-1 text-xs text-text-secondary">
									Provide the final canonical commit hash and the merged bundle.
									The commit may differ from the proposed one if you applied minor
									changes locally before merging.
								</p>
							</div>

							<div>
								<label className="label">Final Canonical Commit Hash</label>
								<input
									type="text"
									value={finalCommit}
									onChange={(e) => setFinalCommit(e.target.value)}
									placeholder="40-char Git SHA-1 or 64-char SHA-256"
									className="input-field w-full font-mono"
								/>
								<p className="mt-1 text-xs text-text-tertiary">
									Pre-filled with the proposed commit. Change if you amended it
									before merging.
								</p>
							</div>

							<div className="space-y-3">
								<label className="label">Merged Bundle Source</label>
								<div className="flex gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] p-1">
									<button
										type="button"
										onClick={() => setCidMode("direct")}
										className={
											cidMode === "direct"
												? "btn-primary flex-1 py-1.5 text-sm"
												: "flex-1 rounded-md py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
										}
									>
										Enter CID Directly
									</button>
									<button
										type="button"
										onClick={() => setCidMode("upload")}
										className={
											cidMode === "upload"
												? "btn-primary flex-1 py-1.5 text-sm"
												: "flex-1 rounded-md py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
										}
									>
										Upload Bundle
									</button>
								</div>

								{cidMode === "direct" ? (
									<div>
										<input
											type="text"
											value={directCid}
											onChange={(e) => setDirectCid(e.target.value)}
											placeholder="bafk2bz..."
											className="input-field w-full font-mono"
										/>
										<p className="mt-1 text-xs text-text-tertiary">
											CID of the merged canonical bundle already uploaded to
											the Bulletin chain.
										</p>
									</div>
								) : (
									<div className="space-y-3">
										<div>
											<input
												type="file"
												accept=".bundle,application/octet-stream"
												onChange={(e) =>
													void handleBundleSelected(e.target.files?.[0])
												}
												className="input-field w-full file:mr-3 file:rounded-md file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-sm file:text-text-primary"
											/>
											{bundleCid ? (
												<p className="mt-1 break-all text-xs font-mono text-text-tertiary">
													{bundleCid}
												</p>
											) : null}
										</div>
										<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 space-y-3">
											<div className="text-xs font-medium text-text-primary">
												Bulletin Signer
											</div>
											<div className="flex flex-wrap gap-2">
												{canUseDevSubstrateSigner ? (
													<button
														onClick={() => setSubstrateSource("dev")}
														className={
															substrateSource === "dev"
																? "btn-primary text-xs px-3 py-1.5"
																: "btn-secondary text-xs px-3 py-1.5"
														}
													>
														Local Dev
													</button>
												) : null}
												<button
													onClick={() => setSubstrateSource("browser")}
													className={
														substrateSource === "browser"
															? "btn-primary text-xs px-3 py-1.5"
															: "btn-secondary text-xs px-3 py-1.5"
													}
												>
													Browser / Host
												</button>
											</div>
											{substrateSource === "dev" &&
											canUseDevSubstrateSigner ? (
												<select
													value={substrateDevAccountIndex}
													onChange={(e) =>
														setSubstrateDevAccountIndex(
															Number(e.target.value),
														)
													}
													className="input-field w-full"
												>
													{substrateDevAccounts.map((a, i) => (
														<option key={a.address} value={i}>
															{a.name} ({a.address})
														</option>
													))}
												</select>
											) : null}
											{substrateSource === "browser" ? (
												<div className="space-y-2">
													<div className="text-xs text-text-tertiary">
														Host: {hostStatus}
														{browserSourceLabel
															? ` · ${browserSourceLabel}`
															: ""}
													</div>
													{browserAccounts.length > 0 ? (
														<select
															value={selectedBrowserAccountIndex}
															onChange={(e) =>
																setSelectedBrowserAccountIndex(
																	Number(e.target.value),
																)
															}
															className="input-field w-full"
														>
															{browserAccounts.map((a, i) => (
																<option key={a.address} value={i}>
																	{a.name || "Account"} (
																	{a.address})
																</option>
															))}
														</select>
													) : null}
													{browserAccounts.length === 0 &&
													availableWallets.length > 0 ? (
														<div className="flex flex-wrap gap-2">
															{availableWallets.map((w) => (
																<button
																	key={w}
																	onClick={() =>
																		void connectSubstrateWallet(
																			w,
																		)
																	}
																	className="btn-secondary text-xs"
																>
																	Connect {w}
																</button>
															))}
														</div>
													) : null}
												</div>
											) : null}
											<div className="text-xs text-text-tertiary">
												{authorizationState === "idle"
													? "Select a bundle to check authorization."
													: null}
												{authorizationState === "checking"
													? "Checking..."
													: null}
												{authorizationState === "authorized" ||
												authorizationState === "unauthorized"
													? authorizationMessage
													: null}
											</div>
										</div>
									</div>
								)}
							</div>

							{bundleHash && cidMode === "upload" ? (
								<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm">
									<div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
										Merged Bundle Hash
									</div>
									<div className="mt-1 break-all font-mono text-text-primary">
										{bundleHash}
									</div>
								</div>
							) : null}

							<button
								type="button"
								onClick={() => void submitMerge()}
								disabled={submitting}
								className="w-full rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
							>
								{submitting ? "Merging..." : "Merge Proposal"}
							</button>

							{status ? (
								<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-text-secondary break-all">
									{status}
								</div>
							) : null}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
