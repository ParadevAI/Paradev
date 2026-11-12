export * from "./touch";

// The transport has no SDK. These are the pinned SDK's default opt-out stores/key.
export function hasAnalyticsOptOut(
	consentKey: string,
	posthogKey: string,
): boolean {
	try {
		if (localStorage.getItem(consentKey) === "declined") return true;
		const key = `__ph_opt_in_out_${posthogKey}`;
		const local = localStorage.getItem(key);
		const cookie = document.cookie
			.split(";")
			.map((p) => p.trim())
			.find((p) => p.startsWith(`${key}=`))
			?.slice(key.length + 1);
		const value = local ?? (cookie ? decodeURIComponent(cookie) : null);
		return (
			value !== null &&
			["0", "false", "no", "off"].includes(value.toLowerCase())
		);
	} catch {
		return true;
	}
}
