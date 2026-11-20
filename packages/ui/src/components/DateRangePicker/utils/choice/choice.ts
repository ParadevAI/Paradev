export interface DatePreset {
	key: string;
	label: string;
	from: string;
	to: string;
}

export interface DateRangeValue {
	from: string;
	to: string;
	preset?: string | null;
}

/**
 * The preset a value stands for: the one it names, else the first with the same days. A value
 * with a null preset is a custom range.
 */
export function presetOf(value: DateRangeValue, groups: DatePreset[][]) {
	if (value.preset === null) return undefined;
	const presets = groups.flat();
	return (
		presets.find(({ key }) => key === value.preset) ??
		presets.find(({ from, to }) => from === value.from && to === value.to)
	);
}

export const valueOfPreset = ({
	key,
	from,
	to,
}: DatePreset): DateRangeValue => ({
	preset: key,
	from,
	to,
});
