import * as Updates from "expo-updates";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

const FOREGROUND_CHECK_MIN_INTERVAL_MS = 15 * 60 * 1000;
const APPLY_AFTER_BACKGROUND_MS = 5 * 60 * 1000;

async function downloadIfAvailable() {
	const check = await Updates.checkForUpdateAsync();
	if (check.isAvailable) await Updates.fetchUpdateAsync();
}

/**
 * expo-updates only checks on cold launch, and phones rarely cold-launch, so
 * this also checks on foreground. A downloaded update applies on the next cold
 * launch, or on return from a long enough stay in the background.
 */
export function useOtaUpdates() {
	const { isUpdatePending } = Updates.useUpdates();
	const isUpdatePendingRef = useRef(isUpdatePending);
	isUpdatePendingRef.current = isUpdatePending;
	const lastCheckedAt = useRef(Date.now());
	const backgroundedAt = useRef<number | null>(null);

	useEffect(() => {
		if (!Updates.isEnabled || __DEV__) return;
		const subscription = AppState.addEventListener("change", (status) => {
			if (status === "background") {
				backgroundedAt.current = Date.now();
				return;
			}
			if (status !== "active") return;

			const awayFor =
				backgroundedAt.current === null
					? 0
					: Date.now() - backgroundedAt.current;
			backgroundedAt.current = null;
			if (isUpdatePendingRef.current && awayFor >= APPLY_AFTER_BACKGROUND_MS) {
				void Updates.reloadAsync().catch(() => {});
				return;
			}

			if (
				Date.now() - lastCheckedAt.current <
				FOREGROUND_CHECK_MIN_INTERVAL_MS
			) {
				return;
			}
			lastCheckedAt.current = Date.now();
			void downloadIfAvailable().catch(() => {});
		});
		return () => subscription.remove();
	}, []);
}
