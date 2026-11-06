import type { UserMessage } from "@superset/chat/protocol";
import type { TranscriptRow } from "../transcriptRows";

export type Speaker = "user" | "agent" | "relay";

export interface SpeakerStart {
	speaker: Speaker;
	/** When the run began; null when no row of it carries a time. */
	at: number | null;
	/** The run is the first on its day, so a day divider goes above it. */
	newDay: boolean;
}

const RUN_GAP_MS = 5 * 60_000;

function localDay(at: number): string {
	return new Date(at).toDateString();
}

function speakerOf(
	row: TranscriptRow,
	isHarnessNote: (item: UserMessage) => boolean,
	relayed: (item: UserMessage) => boolean,
): { speaker: Speaker; at: number | null } | null {
	switch (row.kind) {
		case "outbox":
			return { speaker: "user", at: null };
		case "working":
			return row.folded ? null : { speaker: "agent", at: row.startedAtMs };
		case "tool_run":
			return row.folded ? null : { speaker: "agent", at: null };
		case "item": {
			if (row.folded) return null;
			if (row.item.kind === "user_message") {
				const message = row.item as UserMessage;
				if (isHarnessNote(message)) return null;
				return {
					speaker: relayed(message) ? "relay" : "user",
					at: message.startedAtMs || null,
				};
			}
			return {
				speaker: "agent",
				at: row.item.kind === "agent_message" ? row.item.startedAtMs : null,
			};
		}
		default:
			return null;
	}
}

/**
 * Where each run of one speaker begins, Slack's way: a new speaker, five
 * quiet minutes, or a new day starts a run, and only a run's first row
 * carries the face, the name and the time.
 */
export function speakerStarts(
	rows: readonly TranscriptRow[],
	isHarnessNote: (item: UserMessage) => boolean,
	{
		dayOf = localDay,
		untimed = () => false,
		relayed = () => false,
	}: {
		dayOf?: (at: number) => string;
		/** A row whose time is not when it was said, such as history a resumed session replayed. */
		untimed?: (row: TranscriptRow) => boolean;
		/** A prompt someone other than the person sent, such as a coordinator through the CLI. */
		relayed?: (item: UserMessage) => boolean;
	} = {},
): Map<string, SpeakerStart> {
	const starts = new Map<string, SpeakerStart>();
	let last = null as { speaker: Speaker; at: number | null } | null;
	let lastDay: string | null = null;
	for (const row of rows) {
		const said = speakerOf(row, isHarnessNote, relayed);
		if (!said) continue;
		const turn = untimed(row) ? { ...said, at: null } : said;
		const day = turn.at === null ? null : dayOf(turn.at);
		const sameRun =
			last !== null &&
			last.speaker === turn.speaker &&
			(day === null || day === lastDay) &&
			(turn.at === null || last.at === null || turn.at - last.at < RUN_GAP_MS);
		last = { speaker: turn.speaker, at: turn.at ?? last?.at ?? null };
		if (sameRun) continue;
		// Untimed runs above leave the day unknown, so no divider claims one.
		starts.set(row.key, {
			speaker: turn.speaker,
			at: turn.at,
			newDay:
				day !== null &&
				(lastDay === null ? starts.size === 0 : day !== lastDay),
		});
		if (day !== null) lastDay = day;
	}
	return starts;
}
