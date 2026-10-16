import { formatList } from "@superset/i18n/format";

const NAMED_MAX = 3;

/** "Avery Chen and Blake Rivera", and past three names the rest as a count the caller words. */
export function nameList(
	names: readonly string[],
	more: (count: number) => string,
): string {
	return formatList(
		names.length > NAMED_MAX
			? [...names.slice(0, NAMED_MAX), more(names.length - NAMED_MAX)]
			: [...names],
	);
}
