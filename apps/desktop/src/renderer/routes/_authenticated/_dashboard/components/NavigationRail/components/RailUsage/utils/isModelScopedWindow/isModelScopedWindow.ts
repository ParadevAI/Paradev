import type { UsageQuotaWindow } from "renderer/hooks/host-service/useHostUsageQuota";

const MODEL_SCOPED_IDS = new Set(["seven_day_sonnet"]);

export function isModelScopedWindow(window: UsageQuotaWindow): boolean {
	return window.id.includes(":") || MODEL_SCOPED_IDS.has(window.id);
}
