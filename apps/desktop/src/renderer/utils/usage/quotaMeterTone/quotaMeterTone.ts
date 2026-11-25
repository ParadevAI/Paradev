export type QuotaMeterTone = "normal" | "warning" | "danger";

export function quotaMeterTone(usedPercent: number): QuotaMeterTone {
	if (usedPercent >= 90) return "danger";
	if (usedPercent >= 70) return "warning";
	return "normal";
}

export const QUOTA_METER_FILL_CLASS: Record<QuotaMeterTone, string> = {
	normal: "bg-primary",
	warning: "bg-amber-500",
	danger: "bg-red-500",
};
