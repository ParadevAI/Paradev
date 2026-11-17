/** What both apps' invite cards are made from (sync's `ApiInvitePreview`). */
export interface InviteCardInput {
	title: string;
	invitedBy: string | null;
	people: { name: string }[];
	peopleCount: number;
}

/** The card's line over the group's name: who sent the link. */
export const inviteHeadline = (invite: Pick<InviteCardInput, "invitedBy">) =>
	invite.invitedBy ? `${invite.invitedBy} invited you to` : "You're invited to";

/** Who's in the group, as Messages names a group: "Nina", "Nina and Priya", "Nina, Priya and 3 others". */
export function invitePeopleLine({
	people,
	peopleCount,
}: Pick<InviteCardInput, "people" | "peopleCount">): string {
	const named = people.slice(0, 2).map((p) => p.name);
	const rest = peopleCount - named.length;
	if (named.length === 0) return "";
	if (rest <= 0)
		return named.length === 1 ? named[0]! : `${named[0]} and ${named[1]}`;
	return `${named.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`;
}
