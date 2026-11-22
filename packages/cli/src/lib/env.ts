import { CANONICAL_URLS } from "@superset/shared/constants";
import { readPublicEnv } from "@superset/shared/public-env";

/**
 * Where this CLI points. Production is the default; a dev build is pointed
 * elsewhere by setting these when it runs, never by baking them in — a binary
 * that ignored the variable is what made a production key look invalid when
 * the desktop's bundled CLI checked it against a local stack. `SUPERSET_VERSION`
 * stays baked: it is this build's identity, not an address.
 */

// The superset-cli OAuth client registers its paste redirect on this host only.
// Keep it until the web/API migration moves the CLI to the new root domain.
export const LEGACY_WEB_URL = "https://app.superset.sh";

/**
 * In a cloud workspace, a saved `PARADEV_API_KEY` or `PARADEV_API_URL` can be
 * the customer's own variable from before the rename, so there the CLI reads
 * only the old name.
 */
export function readApiEnv(name: "API_KEY" | "API_URL"): string | undefined {
	if (readPublicEnv("SANDBOX_WORKSPACE_ID")) {
		return process.env[`SUPERSET_${name}`];
	}
	return readPublicEnv(name);
}

export const env = {
	RELAY_URL: process.env.RELAY_URL || "https://relay.superset.sh",
	REALTIME_URL: process.env.REALTIME_URL || "https://realtime.superset.sh",
	SUPERSET_API_URL: readApiEnv("API_URL") || CANONICAL_URLS.API,
	SUPERSET_WEB_URL: process.env.SUPERSET_WEB_URL || LEGACY_WEB_URL,
	VERSION: process.env.SUPERSET_VERSION || "0.0.0-dev",
};

/**
 * True for the CLI compiled into the desktop app bundle (baked at build time
 * by apps/desktop/scripts/build-bundled-cli.ts). The bundled CLI ships without
 * superset-host and lives inside the signed .app, so it can neither run the
 * host service standalone nor update itself in place.
 */
export function isDesktopBundled(): boolean {
	return process.env.SUPERSET_CLI_CHANNEL === "desktop-bundled";
}
