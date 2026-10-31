/**
 * Exact origins from a comma-separated list, such as
 * `https://m.paradev.com,https://m.superset.sh`. Throws on a wildcard, a path
 * or anything else that is not a bare origin.
 */
export function parseOriginList(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			if (entry.includes("*")) {
				throw new Error(`Origin lists take no wildcards: ${entry}`);
			}
			const origin = new URL(entry).origin;
			if (origin === "null" || origin !== entry.replace(/\/$/, "")) {
				throw new Error(`Not a bare origin: ${entry}`);
			}
			return origin;
		});
}
