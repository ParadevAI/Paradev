import type { ChannelBroadcast } from "@superset/shared/channels";

export interface MentionCandidate {
	id: string;
	name: string;
	image: string | null;
}

const MENTION_LIMIT = 20;

/**
 * People matching `query`, channel members first, the way Slack orders its
 * mention menu; each group is alphabetical and the whole list is capped.
 */
export function rankMentionCandidates(
	people: readonly MentionCandidate[],
	memberIds: ReadonlySet<string>,
	query: string,
): { members: MentionCandidate[]; others: MentionCandidate[] } {
	const needle = query.trim().toLowerCase();
	const matching = people
		.filter((person) =>
			needle
				? person.name
						.toLowerCase()
						.split(/\s+/)
						.some((part) => part.startsWith(needle)) ||
					person.name.toLowerCase().startsWith(needle)
				: true,
		)
		.sort((a, b) => a.name.localeCompare(b.name));
	const members = matching.filter((person) => memberIds.has(person.id));
	const others = matching.filter((person) => !memberIds.has(person.id));
	return {
		members: members.slice(0, MENTION_LIMIT),
		others: others.slice(0, Math.max(0, MENTION_LIMIT - members.length)),
	};
}

/** The broadcasts Slack offers outside #general, in its menu order. */
const OFFERED_BROADCASTS: readonly ChannelBroadcast[] = ["channel", "here"];

export function matchingBroadcasts(query: string): ChannelBroadcast[] {
	const needle = query.trim().toLowerCase();
	return OFFERED_BROADCASTS.filter((name) => name.startsWith(needle));
}

/** The widest broadcast among a composer's chips: @channel or @everyone over @here. */
export function strongestBroadcast(
	mentions: readonly { data?: unknown }[],
): ChannelBroadcast | null {
	const found = new Set(
		mentions.flatMap((chip) => {
			const data = chip.data as { broadcast?: ChannelBroadcast } | undefined;
			return data?.broadcast ? [data.broadcast] : [];
		}),
	);
	if (found.has("everyone")) return "everyone";
	if (found.has("channel")) return "channel";
	return found.has("here") ? "here" : null;
}
