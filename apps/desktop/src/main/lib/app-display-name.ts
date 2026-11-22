import { app } from "electron";
import { env } from "main/env.main";
import { LEGACY_APP_NAME } from "./legacy-app-name";

const PRODUCT_NAMES = ["Paradev", LEGACY_APP_NAME];

/** Swaps the product name for the display name and keeps any suffix ("Canary", a dev workspace). */
export function toAppDisplayName(appName: string, displayName: string): string {
	const productName = PRODUCT_NAMES.find((name) => appName.startsWith(name));
	if (!productName) return appName;
	return displayName + appName.slice(productName.length);
}

export function getProductDisplayName(): string {
	return env.DESKTOP_DISPLAY_NAME;
}

export function getAppDisplayName(): string {
	return toAppDisplayName(app.name, env.DESKTOP_DISPLAY_NAME);
}
