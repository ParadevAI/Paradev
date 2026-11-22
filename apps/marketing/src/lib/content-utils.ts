import { formatDate, getActiveLocale } from "@superset/i18n/format";

const MONTH_SHORT = "short";
const _MONTH_LONG = "long";

export function formatContentDate(
	date: string,
	monthStyle: "short" | "long" = MONTH_SHORT,
	locale = getActiveLocale(),
): string {
	return formatDate(
		new Date(date),
		{
			year: "numeric",
			month: monthStyle,
			day: "numeric",
			timeZone: "UTC",
		},
		locale,
	);
}

export function markdownHeadings(
	content: string,
): Array<{ line: number; level: number; text: string }> {
	let fence: { character: string; length: number } | undefined;
	const result: Array<{ line: number; level: number; text: string }> = [];
	content.split("\n").forEach((line, index) => {
		const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (marker?.[1]) {
			const character = marker[1][0] ?? "";
			if (!fence) fence = { character, length: marker[1].length };
			else if (
				character === fence.character &&
				marker[1].length >= fence.length &&
				!marker[2]?.trim()
			)
				fence = undefined;
			return;
		}
		if (fence) return;
		const heading = /^ {0,3}(#{1,6})[ \t]+(.+)$/.exec(line);
		if (heading?.[1] && heading[2])
			result.push({
				line: index,
				level: heading[1].length,
				text: heading[2].replace(/[ \t]+#+[ \t]*$/, "").trim(),
			});
	});
	return result;
}

export function slugify(text: string, locale = "en"): string {
	if (locale !== "en")
		return text
			.normalize("NFC")
			.toLowerCase()
			.trim()
			.replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
			.replace(/^-+|-+$/g, "");
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "");
}

export function stripInlineMarkdown(text: string): string {
	return text
		.replace(/<[^>]*>/g, "")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/[`*_]/g, "")
		.trim();
}

function toDateInput(dateValue: Date | string | number): string {
	return new Date(dateValue).toISOString().split("T")[0] as string;
}

export function normalizeContentDate(
	value: unknown,
	options: { fallbackToNow?: boolean } = {},
): string | undefined {
	const { fallbackToNow = true } = options;
	const fallback = () => (fallbackToNow ? toDateInput(Date.now()) : undefined);

	if (value instanceof Date) {
		return toDateInput(value);
	}

	if (typeof value === "string" || typeof value === "number") {
		return value ? String(value) : fallback();
	}

	if (value) {
		return String(value);
	}

	return fallback();
}
