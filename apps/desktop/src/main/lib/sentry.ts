import * as Sentry from "@sentry/electron/main";
import { IPCMode } from "@sentry/electron/main";
import { isTelemetryEnabled } from "@superset/agent-setup/telemetry";
import { createSentryEventThrottle } from "@superset/shared/sentry-throttle";
import { session } from "electron";
import { APP_PARTITION } from "shared/constants";
import { env } from "../env.main";
import { telemetryGatedTransport } from "./sentry-transport";

let sentryInitialized = false;

// Shared across the process: the point is to notice a repeat, which needs one
// instance rather than one per call.
const throttleRepeats = createSentryEventThrottle();

export function initSentry(): void {
	if (sentryInitialized) return;

	if (!env.SENTRY_DSN_DESKTOP || env.NODE_ENV !== "production") {
		return;
	}
	if (!isTelemetryEnabled()) return;

	try {
		Sentry.init({
			dsn: env.SENTRY_DSN_DESKTOP,
			environment: env.NODE_ENV,
			sendDefaultPii: false,
			// One machine repeating one failure should not crowd out everyone
			// else's rare ones, nor spend the org's quota getting there.
			beforeSend: (event) =>
				isTelemetryEnabled() ? throttleRepeats(event) : null,
			transport: telemetryGatedTransport(Sentry.makeElectronOfflineTransport()),
			ipcMode: IPCMode.Classic,
			getSessions: () => [
				session.defaultSession,
				session.fromPartition(APP_PARTITION),
			],
		});

		sentryInitialized = true;
		console.log("[sentry] Initialized in main process");
	} catch (error) {
		console.error("[sentry] Failed to initialize in main:", error);
	}
}
