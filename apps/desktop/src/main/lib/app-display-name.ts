import { app } from "electron";
import { env } from "main/env.main";

// productName names the bundle, userData, logs and the keychain entry, so
// app.name keeps it; only labels shown to the user carry the display name.
// Installs that predate the rename keep the legacy name.
const PRODUCT_NAME = "Paradev";
const LEGACY_PRODUCT_NAME = "Superset";

/** Swaps the product name for the display name and keeps any suffix ("Canary", a dev workspace). */
export function toAppDisplayName(appName: string, displayName: string): string {
	const prefix = [PRODUCT_NAME, LEGACY_PRODUCT_NAME].find((name) =>
		appName.startsWith(name),
	);
	if (!prefix) return appName;
	return displayName + appName.slice(prefix.length);
}

export function getProductDisplayName(): string {
	return toAppDisplayName(PRODUCT_NAME, env.DESKTOP_DISPLAY_NAME);
}

export function getAppDisplayName(): string {
	return toAppDisplayName(app.name, env.DESKTOP_DISPLAY_NAME);
}
