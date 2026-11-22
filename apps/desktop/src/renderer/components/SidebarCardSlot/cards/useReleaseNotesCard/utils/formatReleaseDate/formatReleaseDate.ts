import { formatDate } from "@superset/i18n/format";

export function formatReleaseDate(
	date: string,
	{ withYear }: { withYear: boolean },
): string {
	return formatDate(new Date(`${date}T00:00:00Z`), {
		year: withYear ? "numeric" : undefined,
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}
