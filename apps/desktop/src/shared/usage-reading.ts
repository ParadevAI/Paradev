export const FRESH_USAGE_AGE_MS = 6 * 60_000;
export const REMOTE_USAGE_AGE_MS = 16 * 60_000;
export const RETAINED_USAGE_AGE_MS = 60 * 60_000;

interface RecordedWindow {
	usedPercent: number;
	resetsAt: Date | string | null;
	observedAt?: Date | string | null;
	source?: "provider" | "claude_statusline" | "claude_sdk";
}

export interface UsageReading<T extends RecordedWindow> {
	freshness: "fresh" | "stale" | "unavailable";
	checkedAt: Date | null;
	windows: T[];
}

/** Retained usage belongs to the verified account, never to a changed sign-in. */
export function usageReading<T extends RecordedWindow>(
	account: {
		status: string;
		identityChanged?: boolean;
		historical?: boolean;
		checkedAt: Date | string | null;
		windows: T[];
	},
	offline = false,
	now = Date.now(),
): UsageReading<T> {
	if (account.identityChanged)
		return { freshness: "unavailable", checkedAt: null, windows: [] };
	const timestamp = new Date(account.checkedAt ?? "").getTime();
	const age = now - timestamp;
	const validDate = Number.isFinite(age) && age >= -60_000;
	const visible = validDate && age <= RETAINED_USAGE_AGE_MS;
	const freshAge = account.windows.some(
		(window) => window.source === "provider",
	)
		? REMOTE_USAGE_AGE_MS
		: FRESH_USAGE_AGE_MS;
	return {
		freshness: !visible
			? "unavailable"
			: !offline &&
					!account.historical &&
					account.status === "ok" &&
					age <= freshAge
				? "fresh"
				: "stale",
		checkedAt: validDate ? new Date(timestamp) : null,
		windows: visible
			? account.windows.filter((window) => {
					if (!Number.isFinite(window.usedPercent)) return false;
					if (!window.observedAt) return true;
					const windowAge = now - new Date(window.observedAt).getTime();
					return (
						Number.isFinite(windowAge) &&
						windowAge >= -60_000 &&
						windowAge <= RETAINED_USAGE_AGE_MS
					);
				})
			: [],
	};
}

export function quotaWindowReading<T extends RecordedWindow>(
	reading: UsageReading<T>,
	window: T | undefined,
	now = Date.now(),
): "current" | "historical" | "awaiting_refresh" | "unavailable" {
	if (!window || !reading.windows.includes(window)) return "unavailable";
	if (window.resetsAt) {
		const reset = new Date(window.resetsAt).getTime();
		if (Number.isFinite(reset) && reset <= now) return "awaiting_refresh";
		if (!Number.isFinite(reset)) return "historical";
	}
	if (window.observedAt) {
		const age = now - new Date(window.observedAt).getTime();
		if (!Number.isFinite(age) || age < -60_000) return "unavailable";
		const freshAge =
			window.source === "provider" ? REMOTE_USAGE_AGE_MS : FRESH_USAGE_AGE_MS;
		if (age > freshAge) return "historical";
	}
	return reading.freshness === "fresh" ? "current" : "historical";
}

export function usageObservation<T extends RecordedWindow>(account: {
	status: string;
	identityChanged?: boolean;
	fetchedAt: Date | string;
	windows: T[];
	lastKnownUsage?: { fetchedAt: Date | string; windows: T[] };
}) {
	const retained =
		account.status === "unavailable" ? account.lastKnownUsage : undefined;
	return {
		status: account.status,
		identityChanged: account.identityChanged,
		checkedAt: retained?.fetchedAt ?? account.fetchedAt,
		windows: retained?.windows ?? account.windows,
		historical: !!retained,
	};
}
