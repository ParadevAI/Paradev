import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

/**
 * When a chat's session is closed for a fresh one. pi compacts inside a turn when the context nears its limit (see
 * `compactionReserve`); between turns the runner rolls the session over instead, once its context is past `tokens` (or
 * `windowShare` of a smaller model's window), once it has been compacted `compactions` times (a summary of summaries
 * keeps less each time), or when a turn failed because the context overflowed.
 */
export interface RolloverLimits {
	tokens: number;
	windowShare: number;
	compactions: number;
}

/**
 * Models have 1M-token windows, which pi alone would fill before compacting: every request of every turn would carry it.
 * A chat's working context rarely needs more than this; the rest is in the chat (`dev chat read`) and the handover.
 */
export const DEFAULT_ROLLOVER: RolloverLimits = {
	tokens: 120_000,
	windowShare: 0.7,
	compactions: 2,
};

export type RolloverReason = "context" | "compactions" | "overflow";

/** What a rollover did, for the log and the watchers' stream. */
export interface Rollover {
	reason: RolloverReason;
	/** Context tokens when it was closed; null when pi didn't know (right after a compaction). */
	tokens: number | null;
	contextWindow: number;
	/** Where the closed session's JSONL went, relative to the sessions folder. */
	archived: string;
	/** Whether the old session wrote a handover note. */
	handover: boolean;
}

/** The context size past which a session is rolled over, for a model with this window. */
export const rolloverTokens = (contextWindow: number, limits: RolloverLimits) =>
	Math.min(limits.tokens, Math.floor(contextWindow * limits.windowShare));

/** Why this session should be rolled over after its turn, or null when it can go on. */
export function rolloverReason(
	state: {
		tokens: number | null;
		contextWindow: number;
		compactions: number;
		overflow: boolean;
	},
	limits: RolloverLimits,
): RolloverReason | null {
	if (state.overflow) return "overflow";
	if (state.compactions >= limits.compactions) return "compactions";
	if (
		state.tokens !== null &&
		state.tokens >= rolloverTokens(state.contextWindow, limits)
	)
		return "context";
	return null;
}

/** pi's smallest reserve; it also leaves the model room to answer. */
const MIN_RESERVE = 16_384;

/**
 * pi's `compaction.reserveTokens` for this window: pi compacts when a turn's context passes `window - reserve`, here
 * twice the rollover size, so one long turn (big files, many tool results) is compacted long before the window fills.
 */
export const compactionReserve = (
	contextWindow: number,
	limits: RolloverLimits,
) =>
	Math.max(
		MIN_RESERVE,
		contextWindow - 2 * rolloverTokens(contextWindow, limits),
	);

/** What the closing session is asked; its answer starts the next one. */
export const HANDOVER_REQUEST = `[Dev: handover] Your context in this chat is nearly full, so after this you continue in a fresh session that starts with only your system prompt, the note you write now, and the chat's latest messages.
Write that note for yourself, under 300 words, plain text: who's who here and what they want, what's open (questions, promises, follow-ups), tasks and sketches in progress with their ids, decisions and preferences people stated that aren't in this chat's rules yet, and anything else you'd need to pick the conversation up.
Don't run any commands or tools, and don't post in the chat: reply with the note only.`;

/** Where a chat's handover note waits for the new session's first turn, so a box stopped in between still has it. */
const handoverPath = (sessionDir: string, chatId: string) =>
	join(sessionDir, `${chatId}.handover.md`);

export function readHandover(
	sessionDir: string,
	chatId: string,
): string | null {
	const path = handoverPath(sessionDir, chatId);
	return existsSync(path) ? readFileSync(path, "utf8") : null;
}

export function writeHandover(
	sessionDir: string,
	chatId: string,
	note: string,
) {
	mkdirSync(sessionDir, { recursive: true });
	writeFileSync(handoverPath(sessionDir, chatId), note);
}

export function clearHandover(sessionDir: string, chatId: string) {
	rmSync(handoverPath(sessionDir, chatId), { force: true });
}

/**
 * Moves a closed session's JSONL to `archive/` under the sessions folder, out of pi's sight (it looks a session up by id
 * in the folder itself), and returns its path relative to the folder. Kept, not deleted: it's the chat's full trace.
 */
export function archiveSession(
	sessionDir: string,
	sessionFile: string,
): string {
	const archive = join(sessionDir, "archive");
	mkdirSync(archive, { recursive: true });
	const name = join("archive", basename(sessionFile));
	renameSync(sessionFile, join(sessionDir, name));
	return name;
}
