import { Link, NavLink, Outlet } from "react-router-dom";
import { useWalletSession } from "./features/auth/useWalletSession";
import { useSubstrateSession } from "./features/auth/useSubstrateSession";
import { MapAccountButton } from "./components/MapAccountButton";
import { DEFAULT_REGISTRY_ADDRESS } from "./config/crrp";
import { shortenAddress } from "./lib/crrp";
import crrpLogo from "./assets/crrp-logo.png";

export default function App() {
	const { account, sourceLabel } = useWalletSession();
	const { browserAccounts, selectedBrowserAccountIndex } = useSubstrateSession();
	const substrateAccount = browserAccounts[selectedBrowserAccountIndex] ?? null;

	return (
		<div className="app-shell bg-pattern">
			<div
				className="gradient-orb"
				style={{ background: "#0d9488", top: "-180px", right: "-120px" }}
			/>
			<div
				className="gradient-orb"
				style={{ background: "#2563eb", bottom: "-220px", left: "-120px" }}
			/>

			<nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-surface-950/80 backdrop-blur-xl">
				<div className="mx-auto flex max-w-7xl items-center gap-3 overflow-x-auto px-4 py-3">
					<Link to="/" className="flex shrink-0 items-center gap-3">
							<img
								src={crrpLogo}
								alt="CRRP logo"
								className="h-10 w-10 rounded-lg object-cover"
							/>
							<div className="min-w-0">
								<div className="text-base font-semibold text-white tracking-tight">
									CRRP
								</div>
								<div className="truncate text-xs text-text-tertiary">
									Canonical repository state, proposals, bundles
								</div>
							</div>
					</Link>

					<div className="hidden h-8 w-px shrink-0 bg-white/[0.08] lg:block" />

					<div className="flex shrink-0 gap-1">
						<NavItem to="/">Repositories</NavItem>
						<NavItem to="/leaderboard">Leaderboard</NavItem>
						<NavItem to="/docs">Docs</NavItem>
						<NavItem to="/config">Config</NavItem>
					</div>

					<div className="ml-auto grid shrink-0 grid-cols-3 gap-1.5 text-xs text-text-secondary">
						<MetaPill
							label="Account"
							value={
								account
									? `${sourceLabel}: ${shortenAddress(account)}`
									: substrateAccount
										? `${substrateAccount.name || "Polkadot"}: ${`${substrateAccount.address.slice(0, 4)}...${substrateAccount.address.slice(-4)}`}`
										: "Not connected"
							}
						/>
						{substrateAccount
							? <MapAccountButton account={substrateAccount} />
							: <MetaPill label="EVM Address" value="No wallet" />
						}
						<MetaPill
							label="Registry"
							value={DEFAULT_REGISTRY_ADDRESS ? `${DEFAULT_REGISTRY_ADDRESS.toString().slice(0, 4)}...${DEFAULT_REGISTRY_ADDRESS.toString().slice(-4)}` : "Unset"}
						/>
					</div>
				</div>
			</nav>

			<main className="relative z-10 mx-auto max-w-7xl px-4 py-8 md:py-10">
				<Outlet />
			</main>
		</div>
	);
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
	return (
		<NavLink
			to={to}
			end
			className={({ isActive }) =>
				`relative rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 whitespace-nowrap ${
					isActive
						? "border border-white/[0.08] bg-white/[0.08] text-white"
						: "text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
				}`
			}
		>
			{children}
		</NavLink>
	);
}

function MetaPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-[136px] max-w-[164px] rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-1.5">
			<div className="panel-label">{label}</div>
			<div className="mt-0.5 truncate font-mono text-text-primary">{value}</div>
		</div>
	);
}
