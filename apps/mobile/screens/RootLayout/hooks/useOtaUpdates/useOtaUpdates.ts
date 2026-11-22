import * as Updates from "expo-updates";
import { useEffect } from "react";
import { AppState } from "react-native";
import { createForegroundUpdateCheck } from "./utils/createForegroundUpdateCheck";

const FOREGROUND_CHECK_MIN_INTERVAL_MS = 15 * 60 * 1000;

async function downloadIfAvailable() {
	const check = await Updates.checkForUpdateAsync();
	if (check.isAvailable) await Updates.fetchUpdateAsync();
}

/**
 * expo-updates only checks on cold launch, and phones rarely cold-launch, so
 * this also checks on foreground. A downloaded update applies on the next cold
 * launch: reloading a running app crashed it (Sentry MOBILE-1C).
 */
export function useOtaUpdates() {
	useEffect(() => {
		if (!Updates.isEnabled || __DEV__) return;
		const subscription = AppState.addEventListener(
			"change",
			createForegroundUpdateCheck({
				minIntervalMs: FOREGROUND_CHECK_MIN_INTERVAL_MS,
				now: Date.now,
				download: () => void downloadIfAvailable().catch(() => {}),
			}),
		);
		return () => subscription.remove();
	}, []);
}
