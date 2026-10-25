import type { ClaudeSubscriptionQuota } from "./claude-subscription";
import type { NativeClaudeCredential } from "./native-claude-scope";
import {
	NATIVE_CLAUDE_FRESH_MS,
	type NativeClaudeUsageWindow,
} from "./native-claude-usage";

export { NATIVE_CLAUDE_FRESH_MS } from "./native-claude-usage";

import type { UsageQuotaWindow } from "./types";

const HTTP_RECONCILE_MS = 30 * 60_000;
type Quota = ClaudeSubscriptionQuota & { fetchedAt: Date };
const date = (value: unknown) =>
	value instanceof Date ? value.getTime() : Number.NaN;
function freshWindow(window: UsageQuotaWindow, now: number): boolean {
	const observed = date(window.observedAt);
	const reset = date(window.resetsAt);
	return (
		Number.isFinite(observed) &&
		observed <= now &&
		now - observed <= NATIVE_CLAUDE_FRESH_MS &&
		Number.isFinite(reset) &&
		reset > now &&
		Number.isFinite(window.usedPercent) &&
		window.usedPercent >= 0 &&
		window.usedPercent <= 100
	);
}
export function mergeNativeClaudeQuota(
	base: Quota,
	native: NativeClaudeUsageWindow[],
	now = Date.now(),
): Quota | null {
	if (base.status !== "ok" && base.status !== "unavailable") return null;
	const windows = [...base.windows];
	let changed = false;
	for (const reading of native) {
		if (reading.id !== "five_hour" && reading.id !== "seven_day") continue;
		const window: UsageQuotaWindow = {
			id: reading.id,
			label: reading.id === "five_hour" ? "Session (5h)" : "Weekly",
			usedPercent: reading.usedPercent,
			resetsAt: new Date(reading.resetsAt),
			observedAt: new Date(reading.observedAt),
			source: reading.source,
		};
		if (!freshWindow(window, now)) continue;
		const oldIndex = windows.findIndex((value) => value.id === window.id);
		const old = windows[oldIndex];
		if (old) {
			const oldObservation =
				old.observedAt === undefined
					? date(base.fetchedAt)
					: date(old.observedAt);
			if (
				Number.isFinite(oldObservation) &&
				oldObservation >= reading.observedAt
			)
				continue;
			const oldReset = date(old.resetsAt);
			if (
				Number.isFinite(oldReset) &&
				(oldReset > reading.resetsAt ||
					(oldReset === reading.resetsAt &&
						old.usedPercent > reading.usedPercent))
			)
				continue;
			windows[oldIndex] = window;
		} else windows.push(window);
		changed = true;
	}
	return changed
		? { ...base, status: "ok", statusDetail: null, windows }
		: null;
}
export function canDeferClaudeHttpQuota(
	base: Quota,
	overlay: Quota,
	now = Date.now(),
): boolean {
	const observed = date(base.fetchedAt);
	if (
		!Number.isFinite(observed) ||
		observed > now ||
		now - observed >= HTTP_RECONCILE_MS
	)
		return false;
	if (base.prepaidBalance) {
		const checkedAt = date(base.prepaidBalance.checkedAt);
		if (
			!Number.isFinite(checkedAt) ||
			checkedAt > now ||
			now - checkedAt >= HTTP_RECONCILE_MS
		)
			return false;
	}
	return ["five_hour", "seven_day"].every((id) =>
		overlay.windows.some(
			(window) =>
				window.id === id &&
				(window.source === "claude_statusline" ||
					window.source === "claude_sdk") &&
				freshWindow(window, now),
		),
	);
}
export function createNativeClaudeQuotaOverlay(deps: {
	enabled(): boolean;
	generation(credential: NativeClaudeCredential): string;
	readCurrent(selection: string | null): Promise<NativeClaudeCredential | null>;
	resolveScope(
		selection: string | null,
		directory: string,
		identity: string,
		generation: string,
	): Promise<string | null>;
	isCurrent(token: string, quota: Quota): boolean;
	snapshot(scope: string): NativeClaudeUsageWindow[];
	now?: () => number;
}) {
	return async (
		credential: { accessToken: string; selection: string | null },
		quota: Quota,
	): Promise<Quota | null> => {
		if (!deps.enabled()) return null;
		try {
			const current = await deps.readCurrent(credential.selection);
			if (!current || current.accessToken !== credential.accessToken)
				return null;
			const scope = await deps.resolveScope(
				credential.selection,
				current.canonicalProfile,
				current.registrationHash,
				deps.generation(current),
			);
			if (!scope || !deps.isCurrent(credential.accessToken, quota)) return null;
			return mergeNativeClaudeQuota(
				quota,
				deps.snapshot(scope),
				deps.now?.() ?? Date.now(),
			);
		} catch {
			return null;
		}
	};
}
