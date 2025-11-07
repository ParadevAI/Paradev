/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly ENABLE_NEW_UI: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
