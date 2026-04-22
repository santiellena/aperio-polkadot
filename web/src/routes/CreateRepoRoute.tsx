import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { encodeFunctionData, isAddress, keccak256, parseUnits, type Abi, type Address, type Hex } from "viem";
import { ZERO_ADDRESS } from "../config/aperio";
import { getPublicClient } from "../config/evm";
import { getStoredEthRpcUrl } from "../config/network";
import { useSubstrateSession } from "../features/auth/useSubstrateSession";
import { useWalletSession } from "../features/auth/useWalletSession";
import { checkBulletinAuthorization, uploadToBulletin } from "../hooks/useBulletin";
import {
	aperioRegistryAbi,
	aperioTreasuryAbi,
	deriveRepoId,
	getRegistryAddress,
	gitCommitHashToBytes32,
	isValidRepoSlugPart,
	normalizeRepoSlugPart,
	shortenAddress,
} from "../lib/aperio";
import { hexHashToCid } from "../utils/cid";
import { hashFileWithBytes } from "../utils/hash";
import { Binary, FixedSizeBinary } from "polkadot-api";
import { stack_template } from "@polkadot-api/descriptors";
import { getClient } from "../hooks/useChain";
import { useChainStore } from "../store/chainStore";

type AuthorizationState = "idle" | "checking" | "authorized" | "unauthorized";

function parseOptionalEthAmount(value: string, label: string, decimals = 18) {
	const trimmed = value.trim();
	if (!trimmed) {
		return 0n;
	}

	try {
		return parseUnits(trimmed, decimals);
	} catch {
		throw new Error(`${label} must be a valid PAS amount`);
	}
}

export default function CreateRepoRoute() {
	const navigate = useNavigate();
	const { account, sourceLabel, canUseDevSigner, devAccountIndex, selectDevAccount, getWalletClientForWrite } =
		useWalletSession();
	const {
		availableWallets,
		browserAccounts,
		selectedBrowserAccountIndex,
		connectBrowserWallet: connectSubstrateWallet,
		getBulletinSigner,
	} = useSubstrateSession();
	const wsUrl = useChainStore((s) => s.wsUrl);
	const substrateAccount = browserAccounts[selectedBrowserAccountIndex] ?? null;
	const substrateH160: `0x${string}` | null = substrateAccount
		? (`0x${keccak256(substrateAccount.polkadotSigner.publicKey).slice(-40)}` as `0x${string}`)
		: null;
	const [organization, setOrganization] = useState("");
	const [repository, setRepository] = useState("");
	const [initialHeadCommit, setInitialHeadCommit] = useState("");
	const [permissionlessContributions, setPermissionlessContributions] = useState(false);
	const [contributors, setContributors] = useState<string[]>([""]);
	const [reviewerAddress, setReviewerAddress] = useState("");
	const [contributionReward, setContributionReward] = useState("0");
	const [reviewReward, setReviewReward] = useState("0");
	const [initialDonation, setInitialDonation] = useState("0");
	const [cidMode, setCidMode] = useState<"upload" | "direct">("upload");
	const [directCid, setDirectCid] = useState("");
	const [bundleName, setBundleName] = useState<string | null>(null);
	const [bundleBytes, setBundleBytes] = useState<Uint8Array | null>(null);
	const [bundleHash, setBundleHash] = useState<`0x${string}` | null>(null);
	const [bundleCid, setBundleCid] = useState<string | null>(null);
	const [authorizationState, setAuthorizationState] = useState<AuthorizationState>("idle");
	const [authorizationMessage, setAuthorizationMessage] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const registryAddress = useMemo(() => {
		try {
			return getRegistryAddress();
		} catch {
			return null;
		}
	}, []);

	const normalizedOrganization = normalizeRepoSlugPart(organization);
	const normalizedRepository = normalizeRepoSlugPart(repository);
	const repoSlugValid =
		isValidRepoSlugPart(normalizedOrganization) && isValidRepoSlugPart(normalizedRepository);
	const derivedRepoId = useMemo(
		() => (repoSlugValid ? deriveRepoId(normalizedOrganization, normalizedRepository) : null),
		[normalizedOrganization, normalizedRepository, repoSlugValid],
	);

	useEffect(() => {
		let cancelled = false;

		async function checkAuthorization() {
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
				if (cancelled) {
					return;
				}
				if (authorized) {
					setAuthorizationState("authorized");
					setAuthorizationMessage(
						`Bulletin signer ${shortenAddress(address)} is authorized via ${signerSourceLabel}.`,
					);
					return;
				}
				setAuthorizationState("unauthorized");
				setAuthorizationMessage(
					`Bulletin signer ${shortenAddress(address)} is not authorized to store ${bundleBytes.length} bytes.`,
				);
			} catch (cause) {
				if (cancelled) {
					return;
				}
				setAuthorizationState("unauthorized");
				setAuthorizationMessage(
					cause instanceof Error ? cause.message : "Bulletin signer is not available",
				);
			}
		}

		void checkAuthorization();

		return () => {
			cancelled = true;
		};
	}, [bundleBytes, getBulletinSigner]);

	const handleBundleSelected = async (file: File | undefined) => {
		if (!file) {
			return;
		}

		setStatus(null);
		setBundleName(file.name);
		const { hash, bytes } = await hashFileWithBytes(file);
		setBundleBytes(bytes);
		setBundleHash(hash);
		setBundleCid(hexHashToCid(hash));
	};

	const submitCreateRepo = async () => {
		try {
			setSubmitting(true);
			setStatus(null);

			if (!registryAddress) {
				throw new Error("Aperio registry address is not configured");
			}
			if (!repoSlugValid) {
				throw new Error("Organization and repository are required");
			}
			if (cidMode === "upload") {
				if (!bundleBytes || !bundleCid || !bundleHash) {
					throw new Error("Select a Git bundle before creating the repository");
				}
				if (!bundleName?.toLowerCase().endsWith(".bundle")) {
					throw new Error("The uploaded artifact must be a .bundle file");
				}
			} else {
				if (!directCid.trim()) {
					throw new Error("Enter a bundle CID");
				}
			}

			const effectiveCid = cidMode === "direct" ? directCid.trim() : bundleCid!;

			const reviewer = reviewerAddress.trim();
			if (reviewer && !isAddress(reviewer)) {
				throw new Error("Reviewer address is not a valid EVM address");
			}

			const contributionRewardAmount = parseOptionalEthAmount(
				contributionReward,
				"Contributor reward",
			);
			const reviewRewardAmount = parseOptionalEthAmount(reviewReward, "Reviewer reward");
			const initialDonationAmount = parseOptionalEthAmount(
				initialDonation,
				"Initial donation",
				account ? 18 : 12,
			);
			const headCommitBytes32 = gitCommitHashToBytes32(initialHeadCommit);
			const repoId = deriveRepoId(normalizedOrganization, normalizedRepository);

			if (cidMode === "upload") {
				setStatus("Checking Bulletin authorization...");
				const {
					address: bulletinAddress,
					signer: bulletinSigner,
					sourceLabel: bulletinSourceLabel,
				} = await getBulletinSigner();
				const bulletinAuthorized = await checkBulletinAuthorization(
					bulletinAddress,
					bundleBytes!.length,
				);
				if (!bulletinAuthorized) {
					throw new Error(
						`Bulletin signer ${bulletinAddress} is not authorized to upload ${bundleBytes!.length} bytes`,
					);
				}

				setStatus(`Uploading ${bundleName} to Bulletin via ${bulletinSourceLabel}...`);
				await uploadToBulletin(bundleBytes!, bulletinSigner);
			}

			if (!account && !substrateH160) {
				throw new Error("No EVM signer is available. Connect a wallet.");
			}

			const publicClient = getPublicClient(getStoredEthRpcUrl());

			const execContractWrite = async (opts: {
				address: `0x${string}`;
				abi: Abi;
				functionName: string;
				args?: unknown[];
				value?: bigint;
			}): Promise<void> => {
				if (account) {
					const walletClient = await getWalletClientForWrite();
					if (!walletClient.account) throw new Error("No EVM signer");
					const hash = await walletClient.writeContract({
						address: opts.address,
						abi: opts.abi,
						functionName: opts.functionName,
						args: opts.args,
						value: opts.value,
						account: walletClient.account,
						chain: walletClient.chain,
					});
					await publicClient.waitForTransactionReceipt({ hash });
					return;
				}
				if (substrateAccount) {
					const calldata = encodeFunctionData({
						abi: opts.abi,
						functionName: opts.functionName,
						args: opts.args ?? [],
					});
					const api = getClient(wsUrl).getTypedApi(stack_template);
					const tx = api.tx.Revive.call({
						dest: FixedSizeBinary.fromHex(opts.address),
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
					return;
				}
				throw new Error("No EVM signer available");
			};

			setStatus("Submitting createRepo transaction...");
			await execContractWrite({
				address: registryAddress,
				abi: aperioRegistryAbi as Abi,
				functionName: "createRepo",
				args: [normalizedOrganization, normalizedRepository, headCommitBytes32, effectiveCid, permissionlessContributions],
			});

			if (!permissionlessContributions) {
				const validContributors = contributors
					.map((c) => c.trim())
					.filter((c) => c && isAddress(c)) as Address[];
				for (const contributorAddress of validContributors) {
					setStatus(`Granting contributor role to ${contributorAddress}...`);
					await execContractWrite({
						address: registryAddress,
						abi: aperioRegistryAbi as Abi,
						functionName: "setContributorRole",
						args: [repoId as Hex, contributorAddress, true],
					});
				}
			}

			if (reviewer) {
				setStatus("Granting reviewer role...");
				await execContractWrite({
					address: registryAddress,
					abi: aperioRegistryAbi as Abi,
					functionName: "setReviewerRole",
					args: [repoId, reviewer as Address, true],
				});
			}

			const treasuryAddress = (await publicClient.readContract({
				address: registryAddress,
				abi: aperioRegistryAbi,
				functionName: "getRepoIncentiveTreasury",
				args: [repoId],
			})) as Address;
			const treasuryConfigured = treasuryAddress !== ZERO_ADDRESS;

			if (contributionRewardAmount > 0n || reviewRewardAmount > 0n) {
				if (!treasuryConfigured) {
					throw new Error("Repository treasury is not configured on-chain");
				}
				setStatus("Configuring treasury payout rewards...");
				await execContractWrite({
					address: treasuryAddress,
					abi: aperioTreasuryAbi as Abi,
					functionName: "setPayoutConfig",
					args: [repoId, contributionRewardAmount, reviewRewardAmount],
				});
			}

			if (initialDonationAmount > 0n) {
				if (!treasuryConfigured) {
					throw new Error("Repository treasury is not configured on-chain");
				}
				setStatus("Funding treasury...");
				await execContractWrite({
					address: treasuryAddress,
					abi: aperioTreasuryAbi as Abi,
					functionName: "donate",
					args: [repoId],
					value: initialDonationAmount,
				});
			}

			navigate(
				`/repo/${encodeURIComponent(normalizedOrganization)}/${encodeURIComponent(normalizedRepository)}`,
			);
		} catch (cause) {
			setStatus(cause instanceof Error ? cause.message : "Repository creation failed");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="space-y-6">
			<section className="space-y-3">
				<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
					<div>
						<h1 className="page-title">Create Repository</h1>
						<p className="mt-2 max-w-3xl text-text-secondary">
							Create an Aperio repository from the web by uploading the canonical Git bundle,
							deriving its CID, and submitting the initial `HEAD` to the registry.
						</p>
					</div>
					<Link to="/" className="btn-secondary">
						Back To Repositories
					</Link>
				</div>
				<div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-text-secondary">
					{cidMode === "upload"
						? "The bundle is uploaded first to the Bulletin chain. The browser does not parse bundle contents, so you must provide the Git HEAD commit hash separately."
						: "Direct CID mode: supply a CID from an external Bulletin upload. The bundle must already be stored on the Bulletin chain."}
				</div>
			</section>

			<section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
				<div className="card space-y-4">
					<div>
						<h2 className="section-title">Repository Inputs</h2>
						<p className="mt-1 text-sm text-text-secondary">
							The repository id is derived client-side from `organization/repository`.
							The bundle should reconstruct the same `HEAD` commit you enter below.
						</p>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<div>
							<label className="label">Organization</label>
							<input
								type="text"
								value={organization}
								onChange={(event) => setOrganization(event.target.value)}
								placeholder="my-org"
								className="input-field w-full"
							/>
						</div>
						<div>
							<label className="label">Repository</label>
							<input
								type="text"
								value={repository}
								onChange={(event) => setRepository(event.target.value)}
								placeholder="my-repo"
								className="input-field w-full"
							/>
						</div>
					</div>
					<div>
						<label className="label">Initial HEAD Commit</label>
						<input
							type="text"
							value={initialHeadCommit}
							onChange={(event) => setInitialHeadCommit(event.target.value)}
							placeholder="40-char Git SHA-1 or 64-char SHA-256"
							className="input-field w-full font-mono"
						/>
					</div>
					<div className="space-y-3">
						<label className="label">Bundle Source</label>
						<div className="flex gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] p-1">
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
						</div>
						{cidMode === "upload" ? (
							<div>
								<input
									type="file"
									accept=".bundle,application/octet-stream"
									onChange={(event) => void handleBundleSelected(event.target.files?.[0])}
									className="input-field w-full file:mr-3 file:rounded-md file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-sm file:text-text-primary"
								/>
								<p className="mt-2 text-xs text-text-tertiary">
									From the repository root: `git bundle create repo.bundle HEAD`. The commit entered above must be the bundle `HEAD`.
								</p>
							</div>
						) : (
							<div>
								<input
									type="text"
									value={directCid}
									onChange={(e) => setDirectCid(e.target.value)}
									placeholder="bafk2bz..."
									className="input-field w-full font-mono"
								/>
								<p className="mt-2 text-xs text-text-tertiary">
									CID of a bundle already uploaded externally to the Bulletin chain.
								</p>
							</div>
						)}
					</div>
					<div className="space-y-3">
						<label className="label">Contribution Mode</label>
						<label className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
							<input
								type="checkbox"
								checked={permissionlessContributions}
								onChange={(event) => setPermissionlessContributions(event.target.checked)}
								className="h-4 w-4 accent-accent-blue"
							/>
							<span className="text-sm text-text-primary">Allow anyone to contribute</span>
						</label>
						<p className="text-xs text-text-tertiary">
							{permissionlessContributions
								? "Any address can submit proposals without a whitelist."
								: "Only whitelisted addresses can submit proposals."}
						</p>
					</div>

					{!permissionlessContributions && (
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<label className="label">Initial Contributors</label>
								<button
									type="button"
									onClick={() => setContributors((prev) => [...prev, ""])}
									className="btn-secondary px-3 py-1 text-xs"
								>
									+ Add
								</button>
							</div>
							{contributors.map((addr, index) => (
								<div key={index} className="flex gap-2">
									<input
										type="text"
										value={addr}
										onChange={(event) => {
											const next = [...contributors];
											next[index] = event.target.value;
											setContributors(next);
										}}
										placeholder="0x..."
										className="input-field flex-1 font-mono"
									/>
									<button
										type="button"
										onClick={() =>
											setContributors((prev) => prev.filter((_, i) => i !== index))
										}
										className="btn-secondary px-3"
									>
										✕
									</button>
								</div>
							))}
							{contributors.length === 0 && (
								<p className="text-xs text-text-tertiary">
									No contributors added. Add at least one address to allow proposal submissions.
								</p>
							)}
						</div>
					)}

					<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-text-secondary">
						<div>Derived Repo ID</div>
						<div className="mt-1 font-mono break-all text-text-primary">
							{derivedRepoId || "Enter a valid organization and repository"}
						</div>
						<div className="mt-3">Bundle CID</div>
						<div className="mt-1 font-mono break-all text-text-primary">
							{cidMode === "direct"
								? (directCid.trim() || "Enter a CID above")
								: (bundleCid || "Select a .bundle file to derive the CID")}
						</div>
					</div>
				</div>

				<div className="card space-y-4">
					<div>
						<h2 className="section-title">Signers</h2>
						<p className="mt-1 text-sm text-text-secondary">
							Bulletin upload uses a Substrate signer. Repository creation and configuration
							use the connected wallet session.
						</p>
					</div>
					<ValueLine
						label="Transaction signer"
						value={
							account
								? `${sourceLabel}: ${shortenAddress(account)}`
								: substrateH160
									? `Substrate: ${shortenAddress(substrateH160)}`
									: "Not connected"
						}
					/>
					{!account && browserAccounts.length === 0 && availableWallets.length > 0 ? (
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
					) : null}
					{canUseDevSigner ? (
						<div>
							<label className="label">Local EVM Dev Signer</label>
							<select
								value={devAccountIndex}
								onChange={(event) => selectDevAccount(Number(event.target.value))}
								className="input-field w-full"
							>
								<option value={0}>Alice</option>
								<option value={1}>Bob</option>
								<option value={2}>Charlie</option>
							</select>
						</div>
					) : null}
					{cidMode === "upload" ? (
						<>
							<div className="border-t border-white/[0.06] pt-4">
								<ValueLine
									label="Bulletin signer"
									value={
										substrateH160
											? `Substrate: ${shortenAddress(substrateH160)}`
											: "Available from connected Substrate session"
									}
								/>
							</div>
							<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-text-secondary">
								{authorizationState === "idle" ? "Select a bundle to check Bulletin authorization." : null}
								{authorizationState === "checking" ? "Checking Bulletin authorization..." : null}
								{authorizationState === "authorized" ? authorizationMessage : null}
								{authorizationState === "unauthorized" ? authorizationMessage : null}
							</div>
						</>
					) : null}
				</div>
			</section>

			<section className="grid gap-4 lg:grid-cols-2">
				<div className="card space-y-4">
					<div>
						<h2 className="section-title">Initial Reviewer Access</h2>
						<p className="mt-1 text-sm text-text-secondary">
							Contributors are intended to be permissionless. The only optional access
							configuration here is the initial reviewer address.
						</p>
					</div>
					<div>
						<label className="label">Reviewer Address</label>
						<input
							type="text"
							value={reviewerAddress}
							onChange={(event) => setReviewerAddress(event.target.value)}
							placeholder="0x..."
							className="input-field w-full font-mono"
						/>
					</div>
				</div>

				<div className="card space-y-4">
					<div>
						<h2 className="section-title">Treasury Configuration</h2>
						<p className="mt-1 text-sm text-text-secondary">
							These values are fixed PAS payouts, not percentages. They do not need to add
							up to 100. After each accepted merge, the configured contributor reward is
							accrued once and the reviewer reward is accrued for each approved reviewer.
						</p>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<div>
							<label className="label">Contributor Reward Per Merge (PAS)</label>
							<input
								type="text"
								value={contributionReward}
								onChange={(event) => setContributionReward(event.target.value)}
								placeholder="0"
								className="input-field w-full"
							/>
						</div>
						<div>
							<label className="label">Reviewer Reward Per Approval (PAS)</label>
							<input
								type="text"
								value={reviewReward}
								onChange={(event) => setReviewReward(event.target.value)}
								placeholder="0"
								className="input-field w-full"
							/>
						</div>
					</div>
					<div>
						<label className="label">Initial Treasury Funding (PAS)</label>
						<input
							type="text"
							value={initialDonation}
							onChange={(event) => setInitialDonation(event.target.value)}
							placeholder="0"
							className="input-field w-full"
						/>
						<p className="mt-2 text-xs text-text-tertiary">
							Funding is optional, but rewards cannot be claimed until the treasury has
							enough balance.
						</p>
					</div>
				</div>
			</section>

			<section className="card space-y-4">
				<div>
					<h2 className="section-title">Submit</h2>
					<p className="mt-1 text-sm text-text-secondary">
						{cidMode === "upload"
							? "This runs the Bulletin upload first, then sends the registry and optional configuration transactions."
							: "This sends the registry and optional configuration transactions using the provided CID."}
					</p>
				</div>
				<div className="grid gap-3 md:grid-cols-3">
					<ValueLine label="Registry" value={registryAddress || "Not configured"} mono />
					{cidMode === "upload" ? (
						<>
							<ValueLine label="Bundle File" value={bundleName || "Not selected"} />
							<ValueLine label="Bundle Hash" value={bundleHash || "Not computed"} mono />
						</>
					) : (
						<ValueLine label="Bundle CID" value={directCid.trim() || "Not entered"} mono />
					)}
				</div>
				<button
					onClick={() => void submitCreateRepo()}
					disabled={submitting}
					className="btn-primary w-full md:w-auto"
				>
					{submitting ? "Creating..." : "Create Repository"}
				</button>
				{status ? (
					<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-text-secondary break-all">
						{status}
					</div>
				) : null}
			</section>
		</div>
	);
}

function ValueLine({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
			<div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{label}</div>
			<div className={`mt-1 break-all text-sm text-text-primary ${mono ? "font-mono" : ""}`}>
				{value}
			</div>
		</div>
	);
}
