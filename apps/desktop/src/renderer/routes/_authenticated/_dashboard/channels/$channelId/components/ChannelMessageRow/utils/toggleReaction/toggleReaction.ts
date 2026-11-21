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
		if (existing?.actorIds.includes(userId)) return [...reactions];
		return existing
			? reactions.map((reaction) =>
					reaction === existing
						? { ...reaction, actorIds: [...reaction.actorIds, userId] }
						: reaction,
				)
			: [...reactions, { emoji, actorIds: [userId] }];
	}
	return reactions.flatMap((reaction) => {
		if (reaction.emoji !== emoji) return [reaction];
		const actorIds = reaction.actorIds.filter((id) => id !== userId);
		return actorIds.length > 0 ? [{ ...reaction, actorIds }] : [];
	});
}
