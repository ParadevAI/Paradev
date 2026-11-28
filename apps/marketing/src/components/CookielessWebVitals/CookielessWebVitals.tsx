"use client";

import { useReportWebVitals } from "next/web-vitals";

import { captureCookieless } from "@/lib/analytics/lazy";

const METRICS = new Set(["CLS", "FCP", "INP", "LCP"]);

export function CookielessWebVitals() {
	useReportWebVitals((metric) => {
		if (!METRICS.has(metric.name)) return;
		captureCookieless("$web_vitals", {
			[`$web_vitals_${metric.name}_value`]: metric.value,
		});
	});
	return null;
}
