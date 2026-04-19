import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import "./index.css";

const HomeRoute = lazy(() => import("./routes/HomeRoute"));
const LeaderboardRoute = lazy(() => import("./routes/LeaderboardRoute"));
const RepoRoute = lazy(() => import("./routes/RepoRoute"));
const RepoHistoryRoute = lazy(() => import("./routes/RepoHistoryRoute"));
const RepoLeaderboardRoute = lazy(() => import("./routes/RepoLeaderboardRoute"));
const RepoTreeRoute = lazy(() => import("./routes/RepoTreeRoute"));

const routeFallback = (
	<div className="card animate-pulse">
		<div className="h-4 w-32 rounded bg-white/[0.06]" />
		<div className="mt-3 h-3 w-56 rounded bg-white/[0.04]" />
	</div>
);

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<HashRouter>
			<Routes>
				<Route element={<App />}>
					<Route
						index
						element={
							<Suspense fallback={routeFallback}>
								<HomeRoute />
							</Suspense>
						}
					/>
					<Route
						path="leaderboard"
						element={
							<Suspense fallback={routeFallback}>
								<LeaderboardRoute />
							</Suspense>
						}
					/>
					<Route
						path="repo/:organization/:repository"
						element={
							<Suspense fallback={routeFallback}>
								<RepoRoute />
							</Suspense>
						}
					/>
					<Route
						path="repo/:organization/:repository/history"
						element={
							<Suspense fallback={routeFallback}>
								<RepoHistoryRoute />
							</Suspense>
						}
					/>
					<Route
						path="repo/:organization/:repository/leaderboard"
						element={
							<Suspense fallback={routeFallback}>
								<RepoLeaderboardRoute />
							</Suspense>
						}
					/>
					<Route
						path="repo/:organization/:repository/tree/*"
						element={
							<Suspense fallback={routeFallback}>
								<RepoTreeRoute />
							</Suspense>
						}
					/>
					<Route path="*" element={<Navigate to="/" replace />} />
				</Route>
			</Routes>
		</HashRouter>
	</StrictMode>,
);
