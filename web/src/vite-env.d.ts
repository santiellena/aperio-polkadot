/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_WS_URL?: string;
	readonly VITE_ETH_RPC_URL?: string;
	readonly VITE_LOCAL_WS_URL?: string;
	readonly VITE_LOCAL_ETH_RPC_URL?: string;
	readonly VITE_REGISTRY_FROM_BLOCK?: string;
	readonly VITE_LOG_CHUNK_SIZE?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
