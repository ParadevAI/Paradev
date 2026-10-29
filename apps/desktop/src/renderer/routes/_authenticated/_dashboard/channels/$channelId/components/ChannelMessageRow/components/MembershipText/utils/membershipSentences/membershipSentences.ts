import type { ChannelMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";

export type MembershipAction = "join" | "leave" | "join,leave" | "leave,join";

export interface MembershipSentence {
	subjectId: string;
	action: MembershipAction;
	inviterId: string | null;
	/** People who did the same; drawn as "along with" or "and". */
	otherIds: string[];
	/** The first sentence's subject is the row's author, so it is not named. */
	first: boolean;
	/** The second sentence starts with "Also,". */
	also: boolean;
}

interface Rollup {
	subtypes: NonNullable<ChannelMessage["subtype"]>[];
	inviterId: string | null;
}

/**
 * Slack's join/leave rollup: per person, the first change and at most one
 * reversal ("joined and left", "rejoined"). The row's author leads; people
 * with the same action and inviter go "along with" them, and everyone else is
 * grouped by action into "Also, …" sentences.
 */
export function membershipSentences(
	messages: readonly ChannelMessage[],
): MembershipSentence[] {
	const rollups = new Map<string, Rollup>();
	for (const message of messages) {
		if (!message.subtype || !message.authorId) continue;
		const rollup = rollups.get(message.authorId);
		if (!rollup) {
			rollups.set(message.authorId, {
				subtypes: [message.subtype],
				inviterId: message.inviterId,
			});
			continue;
		}
		const last = rollup.subtypes.at(-1);
		if (message.subtype === last) continue;
		rollup.subtypes =
			rollup.subtypes.length === 1
				? [...rollup.subtypes, message.subtype]
				: [last ?? message.subtype, message.subtype];
		if (message.inviterId) rollup.inviterId = message.inviterId;
	}
	const entries = [...rollups].map(([id, rollup]) => ({
		id,
		inviterId: rollup.inviterId,
		action: [...new Set(rollup.subtypes)]
			.map((subtype) => (subtype === "channel_join" ? "join" : "leave"))
			.join(",") as MembershipAction,
	}));
	const [lead, ...rest] = entries;
	if (!lead) return [];
	const alongWith = rest.filter(
		(entry) =>
			entry.action === lead.action &&
			(!lead.inviterId || entry.inviterId === lead.inviterId),
	);
	const sentences: MembershipSentence[] = [
		{
			subjectId: lead.id,
			action: lead.action,
			inviterId: lead.inviterId,
			otherIds: alongWith.map((entry) => entry.id),
			first: true,
			also: false,
		},
	];
	const byAction = new Map<MembershipAction, string[]>();
	for (const entry of rest) {
		if (alongWith.includes(entry)) continue;
		byAction.set(entry.action, [
			...(byAction.get(entry.action) ?? []),
			entry.id,
		]);
	}
	for (const [action, [subjectId, ...otherIds]] of byAction) {
		if (!subjectId) continue;
		sentences.push({
			subjectId,
			action,
			inviterId: null,
			otherIds,
			first: false,
			also: sentences.length === 1,
		});
	}
	return sentences;
}
