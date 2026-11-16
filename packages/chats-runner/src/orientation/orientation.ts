/** Who this box's Dev is, from the env the server sets at wake. */
export type DevIdentity = (
	| { kind: "group"; name: string; groupName: string }
	| { kind: "added"; name: string; groupName: string }
	| { kind: "personal" | "custom"; name: string; ownerName: string }
) & {
	/** As people see it next to the Dev's name; absent from an older API. */
	description?: string;
};

/** The identity in the box's env; null when the server didn't send one (an older API), and the prompt goes without. */
export function identityFromEnv(
	env: Record<string, string | undefined>,
): DevIdentity | null {
	const name = env.DEV_NAME ?? "Dev";
	const description = env.DEV_DESCRIPTION
		? { description: env.DEV_DESCRIPTION }
		: {};
	if (env.DEV_KIND === "group" && env.DEV_GROUP_NAME)
		return {
			kind: "group",
			name,
			groupName: env.DEV_GROUP_NAME,
			...description,
		};
	if (env.DEV_KIND === "added" && env.DEV_GROUP_NAME)
		return {
			kind: "added",
			name,
			groupName: env.DEV_GROUP_NAME,
			...description,
		};
	if (
		(env.DEV_KIND === "personal" || env.DEV_KIND === "custom") &&
		env.DEV_OWNER_NAME
	)
		return {
			kind: env.DEV_KIND,
			name,
			ownerName: env.DEV_OWNER_NAME,
			...description,
		};
	return null;
}

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/** The system prompt's first line: who the Dev is and whom it serves. */
export function identityLine(identity: DevIdentity | null): string {
	if (!identity)
		return "You are a Dev: an agent that is a member of chats in the Dev messenger.";
	if (identity.kind === "group")
		return `You are ${identity.name}, the Dev of the group "${identity.groupName}": its guide and helper for everyone in it.`;
	if (identity.kind === "added") {
		const job = identity.description
			? ` ${sentence(identity.description)}`
			: "";
		return `You are ${identity.name}, a Dev a member added to the group "${identity.groupName}" from the Dev registry, for everyone in it.${job}`;
	}
	if (identity.kind === "personal")
		return `You are ${identity.name}, ${identity.ownerName}'s Dev: their personal assistant.`;
	return identity.description
		? `You are ${identity.name}, a Dev ${identity.ownerName} made for: ${sentence(identity.description)}`
		: `You are ${identity.name}, a Dev ${identity.ownerName} made.`;
}

/**
 * Where the Dev lives and what its folder holds, which differs by kind: a group's Dev serves one group and asks
 * members' Devs about them, a person's Dev (personal or custom) is in several chats and carries only its owner's
 * instructions and preferences between them. Written by the platform into the prompt, next to (never inside) `AGENTS.md`.
 */
export function orientationPrompt(
	identity: DevIdentity,
	agentDir: string,
): string {
	// A custom or added Dev's description is already in its identity line.
	const described =
		identity.description &&
		identity.kind !== "custom" &&
		identity.kind !== "added"
			? `\nPeople see you described as: ${identity.description}`
			: "";
	if (identity.kind === "added") {
		return `## You and your folder
You belong to the group, not to any one person, and ${agentDir} is the group's. The group also has its own Dev, which answers when nobody means you: speak when you're asked (mentioned, or a message is for what you do), and leave the rest to it.
- AGENTS.md: your instructions, from your registry listing (under "Your instructions"); don't edit it.
- skills/: what you know how to do in depth, from your listing, and Dev's sketches skill.
- rules/<chat id>.md: what the group wants from you (see Memory); keep it as they tell you, since you have no owner to take instructions from. This chat's is under "This chat's rules".
- apps/: the source of the sketches you made for the group.
- sessions/: your conversation history; don't edit it.
You have no owner, so no you.md and no connected apps. For anything about a member, or that needs an app, ask their Dev (\`dev members\` shows who's whose).`;
	}
	if (identity.kind === "group") {
		return `## You and your folder
You belong to the group, not to any one person, and ${agentDir} is the group's.${described}
- AGENTS.md: instructions the group's members gave you earlier, if any (under "Your instructions"); don't edit it.
- rules/<chat id>.md: what the group has taught you (see Memory); this chat's is under "This chat's rules".
- apps/: the source of the sketches you made for the group.
- sessions/: your conversation history; don't edit it.
You have no owner, so no you.md and no connected apps. For anything about a member (preferences, how they like things done, availability), ask their Dev (\`dev members\` shows who's whose).`;
	}
	return `## You and your folder
You belong to ${identity.ownerName} and are in several chats: their 1:1 with you and groups they brought you into.${described}
${agentDir} is yours, shared by all those chats:
- AGENTS.md: what ${identity.ownerName} wants you to do and how, which you keep from their 1:1 with you (see "Your owner's instructions").
- rules/<chat id>.md: one per chat (see Memory); this chat's is under "This chat's rules".
- memory/you.md: ${identity.ownerName}'s preferences, loaded only in their 1:1 with you and when another Dev asks you something.
- apps/: the source of sketches you made, in any chat. skills/: Dev's sketches skill.
- sessions/: your conversation history per chat; don't edit it.`;
}
