import type { ChannelReaction } from "@superset/shared/channels";

/** The reactions after one person adds or takes back an emoji, for showing it before the server answers. */
export function toggleReaction(
	reactions: readonly ChannelReaction[],
	emoji: string,
	userId: string,
	reacted: boolean,
): ChannelReaction[] {
	const existing = reactions.find((reaction) => reaction.emoji === emoji);
	if (reacted) {
		if (existing?.userIds.includes(userId)) return [...reactions];
		return existing
			? reactions.map((reaction) =>
					reaction === existing
						? { ...reaction, userIds: [...reaction.userIds, userId] }
						: reaction,
				)
			: [...reactions, { emoji, userIds: [userId] }];
	}
	return reactions.flatMap((reaction) => {
		if (reaction.emoji !== emoji) return [reaction];
		const userIds = reaction.userIds.filter((id) => id !== userId);
		return userIds.length > 0 ? [{ ...reaction, userIds }] : [];
	});
}
