export const formatTime = (at: Date) =>
	`${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** What happened, as a title, then one `Field: value` line each, empty ones left out. */
export const turnHeader = (
	title: string,
	fields: [string, string | null | undefined][],
) =>
	[
		`## ${title}`,
		...fields.flatMap(([name, value]) => (value ? [`${name}: ${value}`] : [])),
	].join("\n");
