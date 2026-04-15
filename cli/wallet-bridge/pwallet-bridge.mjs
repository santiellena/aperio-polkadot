#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import SignClient from "@walletconnect/sign-client";
import qrcode from "qrcode-terminal";

const CONNECT_TIMEOUT_MS = 5 * 60_000;

const METADATA = {
	name: "CRRP CLI",
	description: "CRRP CLI wallet sign-in bridge",
	url: "https://crrp.local",
	icons: [],
};

function parseArgs(argv) {
	const args = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		if (token.startsWith("--")) {
			const key = token.slice(2);
			const value = argv[i + 1];
			if (!value || value.startsWith("--")) {
				throw new Error(`Missing value for --${key}`);
			}
			args[key] = value;
			i++;
		} else {
			args._.push(token);
		}
	}
	return args;
}

function requiredArg(args, key) {
	const value = args[key];
	if (!value || typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Missing required argument --${key}`);
	}
	return value.trim();
}

async function readJsonIfExists(filePath) {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		return JSON.parse(raw);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

function extractAccounts(session) {
	const namespaces = Object.values(session.namespaces ?? {});
	return namespaces.flatMap((ns) => ns.accounts ?? []);
}

function timeout(ms) {
	return new Promise((_, reject) => {
		setTimeout(() => reject(new Error("WalletConnect approval timed out")), ms);
	});
}

function printQr(uri, actionLabel) {
	console.error(`Wallet sign-in required for ${actionLabel}.`);
	console.error("Scan this QR with pwallet:");
	qrcode.generate(uri, { small: true }, (qr) => console.error(qr));
	console.error(`WalletConnect URI: ${uri}`);
}

async function ensureSession(args) {
	const sessionFile = requiredArg(args, "session-file");
	const projectId = requiredArg(args, "project-id");
	const chain = requiredArg(args, "chain");
	const actionLabel = args.action || "signing action";

	const client = await SignClient.init({
		projectId,
		metadata: METADATA,
	});

	const persisted = await readJsonIfExists(sessionFile);
	if (persisted?.topic) {
		try {
			const session = client.session.get(persisted.topic);
			const payload = {
				status: "active",
				topic: session.topic,
				wallet_label: session.peer?.metadata?.name ?? "pwallet",
				created_at_unix_secs: persisted.created_at_unix_secs ?? Math.floor(Date.now() / 1000),
				chain,
				accounts: extractAccounts(session),
			};
			await fs.mkdir(path.dirname(sessionFile), { recursive: true });
			await fs.writeFile(sessionFile, JSON.stringify(payload, null, 2) + "\n");
			console.log(JSON.stringify(payload));
			return;
		} catch {
			// Persisted session is stale; continue and establish a new one.
		}
	}

	const { uri, approval } = await client.connect({
		requiredNamespaces: {
			polkadot: {
				methods: ["polkadot_signTransaction", "polkadot_signMessage"],
				chains: [chain],
				events: ["accountsChanged", "chainChanged"],
			},
		},
	});

	if (!uri) {
		throw new Error("WalletConnect did not return a URI for pairing");
	}
	printQr(uri, actionLabel);

	const session = await Promise.race([approval(), timeout(CONNECT_TIMEOUT_MS)]);
	const payload = {
		status: "connected",
		topic: session.topic,
		wallet_label: session.peer?.metadata?.name ?? "pwallet",
		created_at_unix_secs: Math.floor(Date.now() / 1000),
		chain,
		accounts: extractAccounts(session),
	};

	await fs.mkdir(path.dirname(sessionFile), { recursive: true });
	await fs.writeFile(sessionFile, JSON.stringify(payload, null, 2) + "\n");
	console.log(JSON.stringify(payload));
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const command = args._[0];
	if (command !== "ensure-session") {
		throw new Error("Unsupported command. Use: ensure-session");
	}
	await ensureSession(args);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
