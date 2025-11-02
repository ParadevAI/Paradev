import { createElectronRouter } from "electron-router-dom";

export const { Router, registerRoute, settings } = createElectronRouter({
	port: Number(process.env.VITE_DEV_SERVER_PORT) || 4927,

	types: {
		ids: ["main", "about"],
	},
});
