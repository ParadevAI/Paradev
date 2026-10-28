function isImageBlock(value: Record<string, unknown>): boolean {
	return value.type === "image";
}

/**
 * The journal stores raw tool fields as they are, and a tool result can
 * repeat its image there.
 */
export function withoutImageData(raw: unknown): unknown {
	if (Array.isArray(raw)) {
		const next = raw.map(withoutImageData);
		return next.some((value, index) => value !== raw[index]) ? next : raw;
	}
	if (raw === null || typeof raw !== "object") return raw;
	const record = raw as Record<string, unknown>;
	let sanitized = record;
	if (isImageBlock(record)) {
		if (typeof record.data === "string") sanitized = { ...sanitized, data: "" };
		const source = record.source;
		if (
			source &&
			typeof source === "object" &&
			typeof (source as Record<string, unknown>).data === "string"
		) {
			sanitized = { ...sanitized, source: { ...source, data: "" } };
		}
	}
	let changed = sanitized !== record;
	const next: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(sanitized)) {
		const replaced = withoutImageData(value);
		if (replaced !== value) changed = true;
		next[key] = replaced;
	}
	return changed ? next : raw;
}
