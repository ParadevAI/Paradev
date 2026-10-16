export interface ChannelMatch {
	id: string;
	name: string;
}

/** Channels for `#query` the way Slack orders them: names starting with it, then containing it, each alphabetically. */
export function matchChannels(
	channels: Readonly<Record<string, string>>,
	query: string,
	limit = 8,
): ChannelMatch[] {
	const q = query.toLowerCase();
	return Object.entries(channels)
		.map(([id, name]) => ({ id, name, at: name.toLowerCase().indexOf(q) }))
		.filter((c) => c.at >= 0)
		.sort(
			(a, b) =>
				Number(a.at !== 0) - Number(b.at !== 0) || a.name.localeCompare(b.name),
		)
		.slice(0, limit)
		.map(({ id, name }) => ({ id, name }));
}
