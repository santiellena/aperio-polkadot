import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { keccak256 } from "viem";
import { useSubstrateSession } from "../features/auth/useSubstrateSession";
import { useWalletSession } from "../features/auth/useWalletSession";
import { type FileEntry, isBinaryPath, useGitBundle } from "../features/git/useGitBundle";
import { useRepoOverview } from "../features/repo/useRepoOverview";
import { buildBundleUrl, formatGitCommitHash } from "../lib/aperio";

export default function RepoTreeRoute() {
	const { organization, repository } = useParams();
	const { account } = useWalletSession();
	const { browserAccounts, selectedBrowserAccountIndex } = useSubstrateSession();
	const substrateAccount = browserAccounts[selectedBrowserAccountIndex] ?? null;
	const substrateH160 = substrateAccount
		? (`0x${keccak256(substrateAccount.polkadotSigner.publicKey).slice(-40)}` as `0x${string}`)
		: null;
	const effectiveAccount = substrateH160 ?? account;
	const {
		repo,
		loading: repoLoading,
		error: repoError,
	} = useRepoOverview(organization, repository, effectiveAccount);

	const bundleUrl = buildBundleUrl(repo?.latestCid ?? "");
	const gitState = useGitBundle(bundleUrl);

	const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
	const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);
	const [fileContent, setFileContent] = useState<string | null>(null);
	const [fileLoading, setFileLoading] = useState(false);
	const [fileError, setFileError] = useState<string | null>(null);

	const toggleDir = (path: string) => {
		setExpandedDirs((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};

	const openFile = async (entry: FileEntry) => {
		if (gitState.phase !== "ready") return;
		setSelectedFile(entry);
		setFileContent(null);
		setFileError(null);

		if (isBinaryPath(entry.path)) return;

		setFileLoading(true);
		try {
			const bytes = await gitState.readFile(entry.oid);
			setFileContent(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
		} catch (cause) {
			setFileError(cause instanceof Error ? cause.message : "Failed to read file");
		} finally {
			setFileLoading(false);
		}
	};

	if (repoLoading) return <div className="card animate-pulse h-40" />;

	if (repoError || !repo) {
		return (
			<div className="card">
				<h1 className="section-title">Tree Unavailable</h1>
				<p className="mt-3 text-sm text-accent-red">
					{repoError || "Repository not found"}
				</p>
			</div>
		);
	}

	const repoLink = `/repo/${encodeURIComponent(repo.organization)}/${encodeURIComponent(repo.repository)}`;

	return (
		<div className="space-y-4">
			<section className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div>
					<h1 className="page-title">Repository Tree</h1>
					<p className="mt-1 text-text-secondary break-all">
						{repo.organization}/{repo.repository}
					</p>
					{gitState.phase === "ready" ? (
						<p className="mt-1 font-mono text-xs text-text-tertiary">
							HEAD {formatGitCommitHash(gitState.headCommit)}
						</p>
					) : null}
				</div>
				<Link to={repoLink} className="btn-secondary">
					Back To Overview
				</Link>
			</section>

			{!bundleUrl ? (
				<div className="card py-10 text-center text-sm text-text-secondary">
					No canonical CID recorded yet. Create a repository and merge proposals to
					populate the tree.
				</div>
			) : gitState.phase === "idle" || gitState.phase === "loading" ? (
				<div className="card space-y-3 py-8">
					<div className="flex items-center justify-center gap-3 text-sm text-text-secondary">
						<span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
						{gitState.phase === "loading" ? gitState.progress : "Preparing…"}
					</div>
					<p className="text-center text-xs text-text-tertiary">
						Downloading and indexing the Git bundle in your browser. This may take a
						moment for larger repositories.
					</p>
				</div>
			) : gitState.phase === "error" ? (
				<div className="card">
					<p className="text-sm text-accent-red">{gitState.error}</p>
					<p className="mt-2 text-xs text-text-tertiary">
						{gitState.error.includes("EEXIST") ||
						gitState.error.includes("Lock broken") ||
						gitState.error.includes("AbortError")
							? "The browser filesystem could not initialise for this bundle. Refresh or try again."
							: "The bundle may not be accessible from this origin (CORS), or the CID may be invalid."}
					</p>
				</div>
			) : (
				<div className="grid gap-4 lg:grid-cols-[300px_1fr]">
					{/* File tree */}
					<div className="card overflow-y-auto p-0" style={{ maxHeight: "75vh" }}>
						<div className="border-b border-white/[0.06] px-3 py-2">
							<span className="text-xs font-medium uppercase tracking-wider text-text-muted">
								Files ({gitState.files.filter((f) => f.type === "blob").length})
							</span>
						</div>
						<div className="py-1">
							{gitState.files.length === 0 ? (
								<div className="px-3 py-4 text-sm text-text-tertiary">
									Empty repository
								</div>
							) : (
								<FileTree
									files={gitState.files}
									expandedDirs={expandedDirs}
									selectedPath={selectedFile?.path ?? null}
									onToggleDir={toggleDir}
									onSelectFile={openFile}
								/>
							)}
						</div>
					</div>

					{/* File viewer */}
					<div className="card overflow-hidden p-0" style={{ maxHeight: "75vh" }}>
						{!selectedFile ? (
							<div className="flex h-full items-center justify-center py-16 text-sm text-text-tertiary">
								Select a file to view its contents
							</div>
						) : (
							<>
								<div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
									<span className="font-mono text-sm text-text-primary break-all">
										{selectedFile.path}
									</span>
									<span className="ml-3 shrink-0 text-xs text-text-tertiary">
										{selectedFile.oid.slice(0, 8)}
									</span>
								</div>
								<div
									className="overflow-auto"
									style={{ maxHeight: "calc(75vh - 41px)" }}
								>
									{fileLoading ? (
										<div className="flex items-center justify-center gap-2 py-16 text-sm text-text-secondary">
											<span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
											Loading…
										</div>
									) : fileError ? (
										<div className="p-4 text-sm text-accent-red">
											{fileError}
										</div>
									) : isBinaryPath(selectedFile.path) ? (
										<div className="p-4 text-sm text-text-tertiary">
											Binary file — cannot display as text.
										</div>
									) : fileContent === null ? (
										<div className="p-4 text-sm text-text-tertiary">
											No content
										</div>
									) : (
										<pre className="min-w-0 p-4 text-xs leading-relaxed text-text-primary font-mono whitespace-pre overflow-x-auto">
											{fileContent}
										</pre>
									)}
								</div>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function FileTree({
	files,
	expandedDirs,
	selectedPath,
	onToggleDir,
	onSelectFile,
}: {
	files: FileEntry[];
	expandedDirs: Set<string>;
	selectedPath: string | null;
	onToggleDir: (path: string) => void;
	onSelectFile: (entry: FileEntry) => void;
}) {
	const visible = files.filter((entry) => {
		if (entry.depth === 0) return true;
		const parts = entry.path.split("/");
		// Every ancestor directory must be expanded
		for (let i = 1; i < parts.length; i++) {
			if (!expandedDirs.has(parts.slice(0, i).join("/"))) return false;
		}
		return true;
	});

	return (
		<>
			{visible.map((entry) => {
				const indent = entry.depth * 16;
				const isSelected = entry.path === selectedPath;

				if (entry.type === "tree") {
					const isOpen = expandedDirs.has(entry.path);
					return (
						<button
							key={entry.path}
							type="button"
							onClick={() => onToggleDir(entry.path)}
							style={{ paddingLeft: 12 + indent }}
							className="flex w-full items-center gap-1.5 py-1 pr-3 text-left text-sm text-text-secondary hover:bg-white/[0.04] hover:text-text-primary transition-colors"
						>
							<span className="shrink-0 text-[10px] text-text-muted">
								{isOpen ? "▾" : "▸"}
							</span>
							<span className="shrink-0 text-[13px]">📁</span>
							<span className="truncate">{entry.name}</span>
						</button>
					);
				}

				return (
					<button
						key={entry.path}
						type="button"
						onClick={() => void onSelectFile(entry)}
						style={{ paddingLeft: 12 + indent }}
						className={`flex w-full items-center gap-1.5 py-1 pr-3 text-left text-sm transition-colors ${
							isSelected
								? "bg-white/[0.08] text-text-primary"
								: "text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
						}`}
					>
						<span className="shrink-0 w-3" />
						<span className="shrink-0 text-[13px]">{fileIcon(entry.name)}</span>
						<span className="truncate">{entry.name}</span>
					</button>
				);
			})}
		</>
	);
}

function fileIcon(name: string): string {
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	const map: Record<string, string> = {
		ts: "🔷",
		tsx: "⚛️",
		js: "🟨",
		jsx: "⚛️",
		rs: "🦀",
		toml: "⚙️",
		json: "📋",
		md: "📝",
		sol: "💎",
		py: "🐍",
		go: "🐹",
		css: "🎨",
		html: "🌐",
		sh: "🐚",
		lock: "🔒",
		yml: "⚙️",
		yaml: "⚙️",
		png: "🖼️",
		jpg: "🖼️",
		jpeg: "🖼️",
		svg: "🖼️",
		gif: "🖼️",
		wasm: "⚙️",
		txt: "📄",
	};
	return map[ext] ?? "📄";
}
