/** Why a Slack command can't run from here. */
export type Unavailable = "slack-app" | "thread" | "permission";

/** Slack's built-in commands as its `/` menu lists them; only `/shrug` can run outside Slack. */
export const SLASH_COMMANDS = [
	{ name: "archive", unavailable: "permission" },
	{ name: "collapse", unavailable: "slack-app" },
	{ name: "expand", unavailable: "slack-app" },
	{ name: "feed", unavailable: "slack-app" },
	{ name: "me", unavailable: "thread" },
	{ name: "open", unavailable: "slack-app" },
	{ name: "remind", unavailable: "permission" },
	{ name: "remove", unavailable: "permission" },
	{ name: "shrug" },
	{ name: "who", unavailable: "slack-app" },
] as const satisfies readonly { name: string; unavailable?: Unavailable }[];

export type SlashCommandName = (typeof SLASH_COMMANDS)[number]["name"];

/** The shortcuts in Slack's `/` menu that run from here: invite, set the topic, go away. */
export type SlashShortcut = "invite" | "topic" | "away";
export const SLASH_SHORTCUTS: SlashShortcut[] = ["invite", "topic", "away"];

export type SlashEntry =
	| { kind: "command"; name: SlashCommandName; unavailable?: Unavailable }
	| { kind: "shortcut"; shortcut: SlashShortcut };

/** Commands whose name starts with the query, then shortcuts with a word that does, as Slack filters. */
export function slashEntries(
	query: string,
	shortcutLabels: Record<SlashShortcut, string>,
): SlashEntry[] {
	const q = query.toLowerCase();
	const commands: SlashEntry[] = SLASH_COMMANDS.filter((c) =>
		c.name.startsWith(q),
	).map((c) => ({ kind: "command", ...c }));
	const shortcuts: SlashEntry[] = SLASH_SHORTCUTS.filter((shortcut) =>
		shortcutLabels[shortcut]
			.toLowerCase()
			.split(/\s+/)
			.some((word) => word.startsWith(q)),
	).map((shortcut) => ({ kind: "shortcut", shortcut }));
	return [...commands, ...shortcuts];
}

/** What a slash command does once sent: a message to post, or a card action to run. */
export type SlashOutcome =
	| { kind: "post"; text: string }
	| { kind: "action"; actionId: string; input: string }
	| { kind: "invalid"; reason: "unknown" | "needs-argument" | Unavailable };

const SHRUG = "¯\\_(ツ)_/¯";

/** The command being typed: a leading slash and a name, before any space. */
export function typedCommand(text: string): string | null {
	const match = /^\/([a-z]*)$/.exec(text.trim());
	return match ? (match[1] ?? "") : null;
}

/**
 * A sent message that starts with a slash, as Slack reads it: only at the
 * start, the name up to the first space, the rest as its argument.
 */
export function runSlashCommand(mrkdwn: string): SlashOutcome | null {
	const match = /^\/([a-z]+)(?:\s+([\s\S]*))?$/.exec(mrkdwn.trim());
	if (!match) return null;
	const name = match[1];
	const rest = (match[2] ?? "").trim();
	switch (name) {
		case "shrug":
			return { kind: "post", text: rest ? `${rest} ${SHRUG}` : SHRUG };
		case "invite": {
			const id = /<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/.exec(rest)?.[1];
			return id
				? { kind: "action", actionId: "invite", input: id }
				: { kind: "invalid", reason: "needs-argument" };
		}
		case "topic":
			return rest
				? { kind: "action", actionId: "set_topic", input: rest }
				: { kind: "invalid", reason: "needs-argument" };
		case "away":
			return { kind: "action", actionId: "set_presence", input: "away" };
		case "active":
			return { kind: "action", actionId: "set_presence", input: "auto" };
		default: {
			const known = SLASH_COMMANDS.find((c) => c.name === name);
			return {
				kind: "invalid",
				reason: known && "unavailable" in known ? known.unavailable : "unknown",
			};
		}
	}
}
