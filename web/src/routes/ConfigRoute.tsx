import { useState } from "react";
import { useChainStore } from "../store/chainStore";
import { useSubstrateSession } from "../features/auth/useSubstrateSession";
import { type InjectedPolkadotAccount } from "polkadot-api/pjs-signer";
import { keccak256 } from "viem";
import { DEFAULT_REGISTRY_ADDRESS } from "../config/crrp";
import { SpektrExtensionName } from "@novasamatech/product-sdk";

function deriveH160(publicKey: Uint8Array): `0x${string}` {
	const hash = keccak256(publicKey);
	return `0x${hash.slice(-40)}` as `0x${string}`;
}

const walletNames: Record<string, string> = {
	"polkadot-js": "Polkadot.js",
	"subwallet-js": "SubWallet",
	talisman: "Talisman",
};

function CopyableField({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);
	function handleCopy() {
		void navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}
	return (
		<div
			onClick={handleCopy}
			className="flex items-start gap-2 cursor-pointer group"
			title="Click to copy"
		>
			<span className="text-xs text-text-muted w-10 shrink-0 uppercase font-medium pt-0.5">
				{label}
			</span>
			<code className="text-xs text-text-secondary font-mono break-all flex-1 group-hover:text-text-primary transition-colors">
				{value}
			</code>
			<span className="text-xs text-text-muted group-hover:text-text-secondary shrink-0 transition-colors">
				{copied ? "Copied!" : "Copy"}
			</span>
		</div>
	);
}

function AccountCard({
	account,
	badge,
}: {
	account: InjectedPolkadotAccount;
	badge: { className: string; label: string };
}) {
	const h160 = deriveH160(account.polkadotSigner.publicKey);
	return (
		<div className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3 space-y-2">
			<div className="flex items-center justify-between">
				<span className="font-semibold text-text-primary">
					{account.name || "Unnamed Account"}
				</span>
				<span className={`status-badge ${badge.className}`}>{badge.label}</span>
			</div>
			<div className="space-y-1">
				<CopyableField label="SS58" value={account.address} />
				<CopyableField label="ETH" value={h160} />
			</div>
		</div>
	);
}

export default function ConfigRoute() {
	const { wsUrl, ethRpcUrl } = useChainStore();
	const {
		hostStatus,
		browserAccounts,
		availableWallets,
		connectedWallet,
		connectBrowserWallet,
		disconnectBrowserWallet,
	} = useSubstrateSession();

	const spektrBadge = {
		className: "bg-polka-500/10 text-polka-400 border border-polka-500/20",
		label: "Host",
	};
	const extensionBadge = {
		className: "bg-accent-purple/10 text-accent-purple border border-accent-purple/20",
		label: "Extension",
	};

	const spektrAccounts = browserAccounts.filter((a) =>
		(a as { source?: string }).source === SpektrExtensionName,
	);
	const extensionAccounts = connectedWallet ? browserAccounts.filter((a) =>
		(a as { source?: string }).source !== SpektrExtensionName,
	) : [];

	const extensionWallets = availableWallets.filter((n) => n !== SpektrExtensionName);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="page-title">Config</h1>
				<p className="mt-2 text-text-secondary">
					Connect browser extension wallets and view network configuration.
				</p>
			</div>

			<div className="card space-y-3">
				<h2 className="section-title">Network</h2>
				<div className="space-y-2">
					<CopyableField label="WS" value={wsUrl} />
					<CopyableField label="RPC" value={ethRpcUrl} />
					<CopyableField
						label="Registry"
						value={DEFAULT_REGISTRY_ADDRESS ?? "Not configured"}
					/>
				</div>
			</div>

			<div className="card space-y-4">
				<h2 className="section-title">Polkadot Host Accounts</h2>
				{hostStatus === "injecting" ? (
					<p className="text-sm text-text-muted">Connecting to Polkadot Host...</p>
				) : hostStatus === "unavailable" ? (
					<p className="text-sm text-text-muted">
						Not running inside a Polkadot Host. These accounts are only available when
						the app is loaded through a host client such as Nova Wallet.
					</p>
				) : hostStatus === "failed" ? (
					<p className="text-sm text-red-400">Failed to connect to Polkadot Host.</p>
				) : hostStatus === "connected" ? (
					<div className="space-y-3">
						<p className="text-sm font-medium text-teal-400">
							Connected ({spektrAccounts.length} account
							{spektrAccounts.length !== 1 ? "s" : ""})
						</p>
						{spektrAccounts.map((acc) => (
							<AccountCard key={acc.address} account={acc} badge={spektrBadge} />
						))}
					</div>
				) : (
					<p className="text-sm text-text-muted">Detecting host environment...</p>
				)}
			</div>

			<div className="card space-y-4">
				<h2 className="section-title">Browser Extension Wallets</h2>
				{connectedWallet ? (
					<div className="space-y-3">
						<div className="flex items-center gap-3">
							<span className="text-sm font-medium text-teal-400">
								Connected to {walletNames[connectedWallet] ?? connectedWallet}
							</span>
							<button
								onClick={disconnectBrowserWallet}
								className="px-3 py-1 rounded-md bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors"
							>
								Disconnect
							</button>
						</div>
						{extensionAccounts.length === 0 ? (
							<p className="text-sm text-text-muted">No accounts found in this wallet.</p>
						) : (
							extensionAccounts.map((acc) => (
								<AccountCard key={acc.address} account={acc} badge={extensionBadge} />
							))
						)}
					</div>
				) : extensionWallets.length > 0 ? (
					<div className="flex flex-wrap gap-2">
						{extensionWallets.map((name) => (
							<button
								key={name}
								onClick={() => void connectBrowserWallet(name)}
								className="btn-primary"
							>
								Connect {walletNames[name] ?? name}
							</button>
						))}
					</div>
				) : (
					<p className="text-sm text-text-muted">
						No browser extension wallets detected. Install Talisman, SubWallet, or
						Polkadot.js extension to connect.
					</p>
				)}
			</div>
		</div>
	);
}
