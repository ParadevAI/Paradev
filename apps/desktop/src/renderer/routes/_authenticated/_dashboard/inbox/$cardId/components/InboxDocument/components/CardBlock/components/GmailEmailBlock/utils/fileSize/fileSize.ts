import { formatNumber } from "@superset/i18n/format";

const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

/** A size the way Gmail writes it beside a file, in the reader's locale. */
export function fileSize(bytes: number): string {
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < UNITS.length - 1) {
		value /= 1024;
		unit++;
	}
	return formatNumber(value, {
		style: "unit",
		unit: UNITS[unit],
		unitDisplay: "narrow",
		maximumFractionDigits: unit === 0 ? 0 : 1,
	});
}
