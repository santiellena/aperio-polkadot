import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Binary, FixedSizeBinary } from "polkadot-api";
import { stack_template } from "@polkadot-api/descriptors";
import { encodeFunctionData, keccak256, type Abi } from "viem";
import { getPublicClient } from "../config/evm";
import { getStoredEthRpcUrl } from "../config/network";
import { useSubstrateSession } from "../features/auth/useSubstrateSession";
import { useWalletSession } from "../features/auth/useWalletSession";
import { getClient } from "../hooks/useChain";
import { checkBulletinAuthorization, uploadToBulletin } from "../hooks/useBulletin";
import {
	crrpRegistryAbi,
	deriveRepoId,
	getRegistryAddress,
	gitCommitHashToBytes32,
	isValidRepoSlugPart,
	normalizeRepoSlugPart,
	shortenAddress,
} from "../lib/crrp";
import { useChainStore } from "../store/chainStore";
import { hexHashToCid } from "../utils/cid";
import { hashFileWithBytes } from "../utils/hash";

type AuthorizationState = "idle" | "checking" | "authorized" | "unauthorized";

export default function CreateProposalRoute() {
	const { organization: rawOrg, repository: rawRepo } = useParams();
	const navigate = useNavigate();

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
		getBulletinSigner,
	} = useSubstrateSession();
	const wsUrl = useChainStore((s) => s.wsUrl);
	const substrateAccount = browserAccounts[selectedBrowserAccountIndex] ?? null;
	const substrateH160: `0x${string}` | null = substrateAccount
		? (`0x${keccak256(substrateAccount.polkadotSigner.publicKey).slice(-40)}` as `0x${string}`)
		: null;

	const organization = normalizeRepoSlugPart(rawOrg ?? "");
	const repository = normalizeRepoSlugPart(rawRepo ?? "");
	const repoSlugValid = isValidRepoSlugPart(organization) && isValidRepoSlugPart(repository);

	const repoId = useMemo(
		() => (repoSlugValid ? deriveRepoId(organization, repository) : null),
		[organization, repository, repoSlugValid],
	);

	const [proposedCommit, setProposedCommit] = useState("");
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

	useEffect(() => {
		if (cidMode !== "upload") return;
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
				if (cancelled) return;
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
				if (cancelled) return;
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

	const submitProposal = async () => {
		try {
			setSubmitting(true);
			setStatus(null);

			if (!registryAddress) {
				throw new Error("CRRP registry address is not configured");
			}
			if (!repoId) {
				throw new Error("Invalid repository path");
			}

			if (cidMode === "upload") {
				if (!bundleBytes || !bundleCid || !bundleHash) {
					throw new Error("Select a Git bundle before submitting");
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
			const proposedCommitBytes32 = gitCommitHashToBytes32(proposedCommit);

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

			const publicClient = getPublicClient(getStoredEthRpcUrl());
			const execContractWrite = async (opts: {
				address: `0x${string}`;
				abi: Abi;
				functionName: string;
				args?: unknown[];
			}): Promise<void> => {
				if (account) {
					const walletClient = await getWalletClientForWrite();
					if (!walletClient.account) {
						throw new Error("No EVM signer is available for proposal submission");
					}
					const txHash = await walletClient.writeContract({
						address: opts.address,
						abi: opts.abi,
						functionName: opts.functionName,
						args: opts.args,
						account: walletClient.account,
						chain: walletClient.chain,
					});
					await publicClient.waitForTransactionReceipt({ hash: txHash });
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
					return;
				}

				throw new Error("No transaction signer is available for proposal submission");
			};

			setStatus("Submitting proposal to registry...");
			await execContractWrite({
				address: registryAddress,
				abi: crrpRegistryAbi as Abi,
				functionName: "submitProposal",
				args: [repoId, proposedCommitBytes32, effectiveCid],
			});

			navigate(
				`/repo/${encodeURIComponent(organization)}/${encodeURIComponent(repository)}`,
			);
		} catch (cause) {
			setStatus(cause instanceof Error ? cause.message : "Proposal submission failed");
		} finally {
			setSubmitting(false);
		}
	};

	const repoLink = `/repo/${encodeURIComponent(organization)}/${encodeURIComponent(repository)}`;

	return (
		<div className="space-y-6">
			<section className="space-y-3">
				<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
					<div>
						<h1 className="page-title">Submit Proposal</h1>
						<p className="mt-2 max-w-3xl text-text-secondary">
							{cidMode === "upload"
								? "Upload a Git bundle with your changes to the Bulletin Chain, then register the proposed HEAD commit and its CID in the registry."
								: "Register a proposed HEAD commit and CID in the registry. The bundle must already exist on the Bulletin Chain."}
						</p>
					</div>
					<Link to={repoLink} className="btn-secondary">
						Back To Repository
					</Link>
				</div>
				<div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-text-secondary">
					{cidMode === "upload" ? (
						<>
							If{" "}
							<span className="font-mono text-text-primary">
								{organization}/{repository}
							</span>{" "}
							uses a contributor whitelist, your EVM account must hold that role. Create a
							self-contained bundle with{" "}
							<span className="font-mono">git bundle create changes.bundle HEAD</span> — the
							commit you enter below must be the HEAD of that bundle.
						</>
					) : (
						<>
							Direct CID mode: supply a CID from an external Bulletin upload. The bundle
							must already be stored on the Bulletin Chain before the maintainer can merge.
						</>
					)}
				</div>
			</section>

			<section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
				<div className="card space-y-4">
					<div>
						<h2 className="section-title">Proposal Inputs</h2>
						<p className="mt-1 text-sm text-text-secondary">
							The proposed commit is what reviewers and the maintainer will verify
							against the bundle you upload.
						</p>
					</div>
					<div>
						<label className="label">Repository</label>
						<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 font-mono text-sm text-text-primary">
							{organization}/{repository}
						</div>
					</div>
					<div>
						<label className="label">Proposed HEAD Commit</label>
						<input
							type="text"
							value={proposedCommit}
							onChange={(event) => setProposedCommit(event.target.value)}
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
									Bundle must include all commits reachable from your proposed HEAD so
									the maintainer can merge locally without fetching from any remote.
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
					<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-text-secondary">
						<div>Repo ID</div>
						<div className="mt-1 font-mono break-all text-text-primary">
							{repoId ?? "Invalid repository path"}
						</div>
						<div className="mt-3">Bundle CID</div>
						<div className="mt-1 font-mono break-all text-text-primary">
							{cidMode === "direct"
								? (directCid.trim() || "Enter a CID above")
								: (bundleCid ?? "Select a .bundle file to derive the CID")}
						</div>
					</div>
				</div>

				<div className="card space-y-4">
					<div>
						<h2 className="section-title">Signers</h2>
						<p className="mt-1 text-sm text-text-secondary">
							{cidMode === "upload"
								? "Bulletin upload uses a Substrate signer. Proposal submission uses the connected wallet session."
								: "Proposal submission uses the connected wallet session. No Bulletin signer is needed in direct CID mode."}
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
								{authorizationState === "idle"
									? "Select a bundle to check Bulletin authorization."
									: null}
								{authorizationState === "checking"
									? "Checking Bulletin authorization..."
									: null}
								{authorizationState === "authorized" ? authorizationMessage : null}
								{authorizationState === "unauthorized" ? authorizationMessage : null}
							</div>
						</>
					) : null}
				</div>
			</section>

			<section className="card space-y-4">
				<div>
					<h2 className="section-title">Submit</h2>
					<p className="mt-1 text-sm text-text-secondary">
						{cidMode === "upload"
							? "The bundle is uploaded to the Bulletin Chain first, then the proposal transaction is sent to the registry contract."
							: "The proposal transaction is sent to the registry contract using the provided CID."}
					</p>
				</div>
				<div className="grid gap-3 md:grid-cols-3">
					<ValueLine label="Registry" value={registryAddress ?? "Not configured"} mono />
					{cidMode === "upload" ? (
						<>
							<ValueLine label="Bundle File" value={bundleName ?? "Not selected"} />
							<ValueLine label="Bundle Hash" value={bundleHash ?? "Not computed"} mono />
						</>
					) : (
						<ValueLine label="Bundle CID" value={directCid.trim() || "Not entered"} mono />
					)}
				</div>
				<button
					onClick={() => void submitProposal()}
					disabled={submitting}
					className="btn-primary w-full md:w-auto"
				>
					{submitting ? "Submitting..." : "Submit Proposal"}
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
