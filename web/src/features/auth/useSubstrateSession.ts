import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { injectSpektrExtension, SpektrExtensionName } from "@novasamatech/product-sdk";
import type { PolkadotSigner } from "polkadot-api";
import {
	connectInjectedExtension,
	getInjectedExtensions,
	type InjectedPolkadotAccount,
} from "polkadot-api/pjs-signer";
import { devAccounts } from "../../hooks/useAccount";

type BulletinSignerSource = "dev" | "browser";
type HostStatus = "idle" | "injecting" | "connected" | "unavailable" | "failed";

function isLocalHost() {
	if (typeof window === "undefined") {
		return true;
	}

	return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function isHostedEnvironment() {
	if (typeof window === "undefined") {
		return false;
	}

	try {
		return window !== window.top;
	} catch {
		return true;
	}
}

export function useSubstrateSession() {
	const extensionUnsubscribeRef = useRef<(() => void) | null>(null);
	const spektrUnsubscribeRef = useRef<(() => void) | null>(null);
	const canUseDevSigner = isLocalHost();
	const [preferredSource, setPreferredSource] = useState<BulletinSignerSource | null>(
		canUseDevSigner ? "dev" : null,
	);
	const [devAccountIndex, setDevAccountIndex] = useState(0);
	const [connectedWallet, setConnectedWallet] = useState<string | null>(null);
	const [extensionAccounts, setExtensionAccounts] = useState<InjectedPolkadotAccount[]>([]);
	const [spektrAccounts, setSpektrAccounts] = useState<InjectedPolkadotAccount[]>([]);
	const [preferredBrowserAccountIndex, setPreferredBrowserAccountIndex] = useState(0);
	const [hostStatus, setHostStatus] = useState<HostStatus>("idle");

	useEffect(() => {
		let cancelled = false;

		async function initSpektr() {
			if (!isHostedEnvironment()) {
				setHostStatus("unavailable");
				return;
			}

			setHostStatus("injecting");
			try {
				let injected = false;
				for (let index = 0; index < 10; index += 1) {
					if (await injectSpektrExtension()) {
						injected = true;
						break;
					}
					if (index < 9) {
						await new Promise((resolve) => setTimeout(resolve, 500));
					}
				}

				if (!injected) {
					setHostStatus("failed");
					return;
				}

				const extension = await connectInjectedExtension(SpektrExtensionName);
				if (cancelled) {
					extension.disconnect();
					return;
				}

				const accounts = extension.getAccounts();
				setSpektrAccounts(accounts);
				setHostStatus("connected");
				spektrUnsubscribeRef.current?.();
				spektrUnsubscribeRef.current = extension.subscribe((updated) => {
					setSpektrAccounts(updated);
				});
			} catch {
				setHostStatus("failed");
			}
		}

		void initSpektr();

		return () => {
			cancelled = true;
			spektrUnsubscribeRef.current?.();
			spektrUnsubscribeRef.current = null;
		};
	}, []);

	useEffect(() => {
		return () => {
			extensionUnsubscribeRef.current?.();
			spektrUnsubscribeRef.current?.();
		};
	}, []);

	const availableWallets = useMemo(() => {
		try {
			return getInjectedExtensions().filter((walletName) => walletName !== SpektrExtensionName);
		} catch {
			return [];
		}
	}, []);
	const browserAccounts = spektrAccounts.length > 0 ? spektrAccounts : extensionAccounts;
	const browserSourceLabel =
		spektrAccounts.length > 0
			? "Polkadot Host"
			: connectedWallet
				? `Extension: ${connectedWallet}`
				: null;
	const selectedSource =
		preferredSource === "browser" && browserAccounts.length === 0
			? canUseDevSigner
				? "dev"
				: null
			: preferredSource ??
				(canUseDevSigner ? "dev" : browserAccounts.length > 0 ? "browser" : null);
	const selectedBrowserAccountIndex =
		browserAccounts.length === 0
			? 0
			: Math.min(preferredBrowserAccountIndex, browserAccounts.length - 1);

	const connectBrowserWallet = useCallback(async (walletName: string) => {
		const extension = await connectInjectedExtension(walletName);
		extensionUnsubscribeRef.current?.();
		extensionUnsubscribeRef.current = extension.subscribe((updated) => {
			setExtensionAccounts(updated);
		});
		setExtensionAccounts(extension.getAccounts());
		setConnectedWallet(walletName);
		setPreferredSource("browser");
	}, []);

	return useMemo(
		() => ({
			selectedSource,
			setSelectedSource: setPreferredSource,
			canUseDevSigner,
			devAccountIndex,
			setDevAccountIndex,
			devAccounts,
			hostStatus,
			availableWallets,
			browserAccounts,
			browserSourceLabel,
			selectedBrowserAccountIndex,
			setSelectedBrowserAccountIndex: setPreferredBrowserAccountIndex,
			connectBrowserWallet,
			getBulletinSigner: async (): Promise<{
				address: string;
				signer: PolkadotSigner;
				sourceLabel: string;
			}> => {
				// Bulletin chain upload always uses Alice — she is pre-authorized on the Bulletin chain.
				// User wallets are not registered there, so forcing Alice avoids authorization failures.
				return {
					address: devAccounts[0].address,
					signer: devAccounts[0].signer,
					sourceLabel: "Alice (Bulletin)",
				};
			},
		}),
		[
			availableWallets,
			browserAccounts,
			browserSourceLabel,
			canUseDevSigner,
			connectBrowserWallet,
			devAccountIndex,
			hostStatus,
			selectedBrowserAccountIndex,
			selectedSource,
		],
	);
}
