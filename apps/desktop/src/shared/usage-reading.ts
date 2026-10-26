import {
	QUOTA_NATIVE_FRESHNESS_MS,
	QUOTA_PROVIDER_FRESHNESS_MS,
	quotaObservationFresh,
} from "./quota-freshness";

export const FRESH_USAGE_AGE_MS = QUOTA_NATIVE_FRESHNESS_MS;
export const REMOTE_USAGE_AGE_MS = QUOTA_PROVIDER_FRESHNESS_MS;
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
	/** Availability is independent of an unrelated outer HTTP observation date. */
	liveEligible?: boolean;
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
	const liveEligible =
		!offline && !account.historical && account.status === "ok";
	const windows = account.windows.filter((window) => {
		if (!Number.isFinite(window.usedPercent)) return false;
		const measured = window.observedAt ?? account.checkedAt;
		if (measured === null || measured === undefined) return false;
		const windowAge = now - new Date(measured).getTime();
		return (
			Number.isFinite(windowAge) &&
			windowAge >= -60_000 &&
			windowAge <= RETAINED_USAGE_AGE_MS
		);
	});
	return {
		// The summary date describes provider collection. It must not be renewed by a native leaf.
		freshness: !visible
			? windows.length > 0
				? "stale"
				: "unavailable"
			: liveEligible && quotaObservationFresh({}, account.checkedAt, now)
				? "fresh"
				: "stale",
		checkedAt: validDate ? new Date(timestamp) : null,
		windows,
		liveEligible,
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
	return (reading.liveEligible ?? reading.freshness === "fresh") &&
		quotaObservationFresh(window, reading.checkedAt, now)
		? "current"
		: "historical";
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
