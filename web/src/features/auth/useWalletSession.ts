import { useEffect, useMemo, useState } from "react";
import { createWalletClient, custom, defineChain, type Address, type EIP1193Provider } from "viem";
import { evmDevAccounts, getPublicClient, getWalletClient } from "../../config/evm";
import { getStoredEthRpcUrl } from "../../config/network";

declare global {
	interface Window {
		ethereum?: EIP1193Provider;
	}
}

type WalletSource = "browser" | "dev";

type WalletSessionState = {
	account: Address | null;
	source: WalletSource | null;
	sourceLabel: string;
	devAccountIndex: number;
	canUseBrowserWallet: boolean;
	canUseDevSigner: boolean;
	connectBrowserWallet: () => Promise<void>;
	selectDevAccount: (index: number) => void;
	getWalletClientForWrite: () => Promise<ReturnType<typeof createWalletClient>>;
};

async function createInjectedWalletClient(account: Address) {
	if (!window.ethereum) {
		throw new Error("No browser wallet provider found");
	}

	const publicClient = getPublicClient(getStoredEthRpcUrl());
	const chainId = await publicClient.getChainId();
	const chain = defineChain({
		id: chainId,
		name: "CRRP Network",
		nativeCurrency: { name: "Unit", symbol: "UNIT", decimals: 18 },
		rpcUrls: { default: { http: [getStoredEthRpcUrl()] } },
	});

	return createWalletClient({
		account,
		chain,
		transport: custom(window.ethereum),
	});
}

function canUseLocalDevSigner() {
	if (import.meta.env.VITE_DISABLE_DEV_SIGNER) {
		return false;
	}
	if (typeof window === "undefined") {
		return true;
	}
	return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function useWalletSession(): WalletSessionState {
	const [browserAccount, setBrowserAccount] = useState<Address | null>(null);
	const [devAccountIndex, setDevAccountIndex] = useState(0);
	const canUseBrowserWallet = typeof window !== "undefined" && Boolean(window.ethereum);
	const localDevSignerEnabled = canUseLocalDevSigner();

	useEffect(() => {
		if (!window.ethereum) {
			return;
		}

		let cancelled = false;

		const syncAccounts = async () => {
			try {
				const accounts = (await window.ethereum?.request({
					method: "eth_accounts",
				})) as Address[] | undefined;
				if (!cancelled) {
					setBrowserAccount(accounts?.[0] ?? null);
				}
			} catch {
				if (!cancelled) {
					setBrowserAccount(null);
				}
			}
		};

		void syncAccounts();

		const handleAccountsChanged = (accounts: unknown) => {
			const nextAccount = Array.isArray(accounts) ? ((accounts[0] as Address | undefined) ?? null) : null;
			setBrowserAccount(nextAccount);
		};

		window.ethereum.on?.("accountsChanged", handleAccountsChanged);

		return () => {
			cancelled = true;
			window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
		};
	}, []);

	const source: WalletSource | null = browserAccount
		? "browser"
		: localDevSignerEnabled
			? "dev"
			: null;
	const account =
		browserAccount ??
		(localDevSignerEnabled ? (evmDevAccounts[devAccountIndex]?.account.address ?? null) : null);

	return useMemo(
		() => ({
			account,
			source,
			sourceLabel:
				source === "browser" ? "Browser wallet" : source === "dev" ? "Dev signer" : "No wallet",
			devAccountIndex,
			canUseBrowserWallet,
			canUseDevSigner: localDevSignerEnabled,
			connectBrowserWallet: async () => {
				if (!window.ethereum) {
					throw new Error("No browser wallet provider found");
				}
				const accounts = (await window.ethereum.request({
					method: "eth_requestAccounts",
				})) as Address[];
				setBrowserAccount(accounts[0] ?? null);
			},
			selectDevAccount: (index: number) => {
				setDevAccountIndex(index);
			},
			getWalletClientForWrite: async () => {
				if (browserAccount) {
					return createInjectedWalletClient(browserAccount);
				}
				if (!localDevSignerEnabled) {
					throw new Error("Connect a browser wallet to submit transactions");
				}
				return getWalletClient(devAccountIndex, getStoredEthRpcUrl());
			},
		}),
		[account, browserAccount, canUseBrowserWallet, devAccountIndex, localDevSignerEnabled, source],
	);
}
