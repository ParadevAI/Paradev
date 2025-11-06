import { resolve } from "node:path";
import { config } from "dotenv";
import { createElectronRouter } from "electron-router-dom";

// Load .env from monorepo root BEFORE reading env variables
// Use override: true to ensure .env values take precedence over inherited env vars
config({ path: resolve(__dirname, "../../../../.env"), override: true });

export const { Router, registerRoute, settings } = createElectronRouter({
	port: Number(process.env.VITE_DEV_SERVER_PORT) || 4927,
	types: {
		ids: ["main", "about"],
	},
});
