/** The chat around a turn, as the server sends it (`meta.chat`); the runner adds to the input what the session lacks. */
export interface ChatContext {
	/**
	 * The chat's latest messages before the turn, oldest first, as `- Name: text` lines. `seen` when this Dev had them
	 * in an earlier turn here, so a session that ran that turn already holds them.
	 */
	recent: { line: string; seen: boolean }[];
	/** Who's in the chat, with ids (and, for a group's Dev, which members' Devs have connected apps). */
	roster: string;
	/** This Dev's brief of the chat as people see it, and what's waiting on them; absent where no brief is kept. */
	brief?: string;
}

/** What the session already holds, which decides what a turn's input repeats. */
export interface SessionState {
	/** Nothing has run in this session yet: the chat's first turn, or the first after a restart that lost it or a rollover. */
	fresh: boolean;
	/** The note the previous session wrote when it was rolled over; only for a fresh session. */
	handover?: string | null;
	/** The roster this session was last given; it's given again only when it changed. */
	roster?: string | null;
	/** The brief this session was last given; given again only when it changed. */
	brief?: string | null;
}

/** Recent messages a turn may carry, about 3k tokens; `dev chat read` gets the rest. */
const RECENT_BUDGET_CHARS = 12_000;

const ROSTER_TITLE =
	"In this chat (names can repeat; use ids with `dev ask`, and `<@dev:id>` / `<@user:id>` to mention exactly):";

const BRIEF_HINT =
	"If this turn changes what's happening here (work started or finished, something now waiting on someone, a decision made), end it by rewriting your brief with `dev brief`.";

/** The newest lines that fit the budget, oldest first. */
function withinBudget(lines: string[]) {
	const kept: string[] = [];
	let size = 0;
	for (const line of lines.toReversed()) {
		size += line.length + 1;
		if (size > RECENT_BUDGET_CHARS) break;
		kept.unshift(line);
	}
	return kept;
}

const LATEST = " (latest)";

/**
 * What happened here that the session's own history lacks: a trigger's events turn or a 1:1's `--group` send posts
 * from another session, and other people post while this one idles. The session's last topic is the one it remembers,
 * so without the newest line marked and a rule for "this" or "that", a short message was read against the older topic
 * the session held rather than what had just been posted (checked against variants: marking the newest line and
 * stating the rule is what made the model pick it, a clearer heading or moving the list before the message did not).
 */
function unseenBlock(lines: string[]) {
	const marked = [...lines.slice(0, -1), `${lines.at(-1)}${LATEST}`];
	return `Since your last turn here, not in your history above (oldest first):\n${marked.join("\n")}\n\nA short message like "this", "that" or "it" is about the newest message here, the one marked${LATEST}, unless it names something else.`;
}

/**
 * A turn's input as the agent reads it: the server's text first (what happened: a header, then the message, task or
 * question), then what this session doesn't hold yet. A fresh session gets a note saying its history is missing (with
 * the handover note after a rollover) and the chat's recent messages; a running one only the messages it hasn't seen.
 * The roster goes in when the session is fresh or the roster changed.
 */
export function turnInput(
	text: string,
	chat: ChatContext | undefined,
	state: SessionState,
): string {
	if (!chat) return text;
	const blocks = [text];
	if (state.fresh) {
		const recent = withinBudget(chat.recent.map((r) => r.line));
		const note = state.handover
			? `New session: your last one in this chat filled up and was closed. Its handover note:\n${state.handover.trim()}\n\`dev chat read --limit 50\` reads older messages.`
			: "New session: your earlier conversation in this chat isn't in your context. `dev chat read --limit 50` reads older messages.";
		// A chat's very first message has no history to miss.
		if (recent.length)
			blocks.push(
				`${note}\n\nRecent messages here (oldest first):\n${recent.join("\n")}`,
			);
		else if (state.handover) blocks.push(note);
	} else {
		const unseen = withinBudget(
			chat.recent.filter((r) => !r.seen).map((r) => r.line),
		);
		if (unseen.length) blocks.push(unseenBlock(unseen));
	}
	if (state.fresh || chat.roster !== state.roster)
		blocks.push(`${ROSTER_TITLE}\n${chat.roster}`);
	if (chat.brief && (state.fresh || chat.brief !== state.brief))
		blocks.push(`${chat.brief}\n${BRIEF_HINT}`);
	return blocks.join("\n\n");
}
