import { app } from "electron";
import { env } from "main/env.main";

// productName names the bundle, userData, logs and the keychain entry, so
// app.name keeps it; only labels shown to the user carry the display name.
const PRODUCT_NAME = "Superset";

/** Swaps the product name for the display name and keeps any suffix ("Canary", a dev workspace). */
export function toAppDisplayName(appName: string, displayName: string): string {
	if (!appName.startsWith(PRODUCT_NAME)) return appName;
	return displayName + appName.slice(PRODUCT_NAME.length);
}

export function getProductDisplayName(): string {
	return toAppDisplayName(PRODUCT_NAME, env.DESKTOP_DISPLAY_NAME);
}

export function getAppDisplayName(): string {
	return toAppDisplayName(app.name, env.DESKTOP_DISPLAY_NAME);
}
