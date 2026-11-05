const BLOCKED_SCHEMES = new Set(["javascript", "data", "vbscript", "file"]);
const BARE_SCHEMES = new Set(["mailto", "tel"]);
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;

/** A safe link target for what was typed, or null for a script or data URL. */
export function normalizeUrl(input: string): string | null {
	const trimmed = input.trim();
	const scheme = /^([a-z][a-z0-9+.-]*):(.*)$/i.exec(trimmed);
	const name = scheme?.[1]?.toLowerCase();
	if (name && BLOCKED_SCHEMES.has(name)) return null;
	if (name && (scheme?.[2]?.startsWith("//") || BARE_SCHEMES.has(name))) {
		return trimmed;
	}
	return LOCAL_HOST.test(trimmed) ? `http://${trimmed}` : `https://${trimmed}`;
}
