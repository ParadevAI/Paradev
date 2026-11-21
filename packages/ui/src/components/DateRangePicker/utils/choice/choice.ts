export interface DatePreset {
	key: string;
	label: string;
	from: string;
	to: string;
}

export interface DateRangeValue {
	from: string;
	to: string;
	/** The key of the preset this range was chosen as; null for a custom range. */
	preset: string | null;
}

export const presetOf = (value: DateRangeValue, groups: DatePreset[][]) =>
	groups.flat().find(({ key }) => key === value.preset);

export const valueOfPreset = ({
	key,
	from,
	to,
}: DatePreset): DateRangeValue => ({
	preset: key,
	from,
	to,
});
