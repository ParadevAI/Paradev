import type { CardField, CardView } from "./types";

const LINK_KEYS = ["permalink", "url", "htmlUrl", "html_url", "webUrl", "link"];
const MAX_DEPTH = 5;

const isWebLink = (value: unknown): value is string =>
	typeof value === "string" && /^https:\/\//.test(value);

function firstLink(value: unknown, depth: number): string | null {
	if (!value || typeof value !== "object" || depth > MAX_DEPTH) return null;
	if (Array.isArray(value)) {
		for (const entry of value) {
			const found = firstLink(entry, depth + 1);
			if (found) return found;
		}
		return null;
	}
	const record = value as Record<string, unknown>;
	for (const key of LINK_KEYS) {
		if (isWebLink(record[key])) return record[key];
	}
	for (const entry of Object.values(record)) {
		const found = firstLink(entry, depth + 1);
		if (found) return found;
	}
	return null;
}

/**
 * Where the thing a card is about lives in its own app: the first link among
 * the card's fields, or the first one its view carries.
 */
export function cardSource(
	fields: CardField[],
	view: CardView | undefined,
): string | undefined {
	return (
		fields.find((field) => isWebLink(field.href))?.href ??
		firstLink(view, 0) ??
		undefined
	);
}
