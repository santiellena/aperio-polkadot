import { Link, NavLink, Outlet } from "react-router-dom";
import { useChainStore } from "./store/chainStore";
import { useWalletSession } from "./features/auth/useWalletSession";
import { DEFAULT_REGISTRY_ADDRESS } from "./config/crrp";
import { shortenAddress } from "./lib/crrp";

export default function App() {
	const ethRpcUrl = useChainStore((state) => state.ethRpcUrl);
	const { account, sourceLabel } = useWalletSession();

	return (
		<div className="min-h-screen bg-pattern relative">
			<div
				className="gradient-orb"
				style={{ background: "#0f766e", top: "-220px", right: "-120px" }}
			/>
			<div
				className="gradient-orb"
				style={{ background: "#2563eb", bottom: "-220px", left: "-120px" }}
			/>

			<nav className="sticky top-0 z-50 border-b border-white/[0.06] backdrop-blur-xl bg-surface-950/85">
				<div className="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-4 md:flex-row md:items-center">
					<div className="flex items-center gap-4">
						<Link to="/" className="flex items-center gap-3 shrink-0">
							<div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white font-semibold">
								C
							</div>
							<div>
								<div className="text-sm font-semibold text-white tracking-tight">
									CRRP Web
								</div>
								<div className="text-xs text-text-tertiary">
									Read-first repository registry
								</div>
							</div>
						</Link>

						<div className="flex gap-1 overflow-x-auto">
							<NavItem to="/">Repositories</NavItem>
							<NavItem to="/leaderboard">Leaderboard</NavItem>
						</div>
					</div>

					<div className="ml-auto grid grid-cols-1 gap-2 text-xs text-text-secondary md:grid-cols-3 md:items-center">
						<MetaPill label="Registry" value={DEFAULT_REGISTRY_ADDRESS ? shortenAddress(DEFAULT_REGISTRY_ADDRESS) : "Unset"} />
						<MetaPill label="RPC" value={ethRpcUrl.replace(/^https?:\/\//, "")} />
						<MetaPill
							label="Account"
							value={account ? `${sourceLabel}: ${shortenAddress(account)}` : "Not connected"}
						/>
					</div>
				</div>
			</nav>

			<main className="relative z-10 max-w-6xl mx-auto px-4 py-8">
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
				`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
					isActive
						? "text-white bg-white/[0.08] border border-white/[0.08]"
						: "text-text-secondary hover:text-text-primary hover:bg-white/[0.04]"
				}`
			}
		>
			{children}
		</NavLink>
	);
}

function MetaPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
			<div className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{label}</div>
			<div className="mt-1 text-text-primary font-mono break-all">{value}</div>
		</div>
	);
}
