import type { ChatState } from "../chat-state/chat-state.ts";
import { type NeedItem, needsYou } from "../needs-you/needs-you.ts";

/**
 * Human load: how much your Devs ask of your attention, as two readings that mean different things and are never
 * added (docs/specs/2026-11-10-load-algorithm-options.html):
 *
 * - **Backlog**: what's waiting on you (questions, tasks handed to you). A forecast that doesn't fade while the
 *   thing is open. Answering a question ≈ 1.5 min, triaging a task ≈ 2; 12 minutes of that is a full backlog, so 4
 *   open questions are half and 8 are full, the same scale as the needs-you counts.
 * - **Churn**: how scattered the recent past was: switching between chats, catching up, answering and moving tasks.
 *   Every event adds a cost that fades with a 15-minute half-life, so nothing drops off at an hour's edge, and a
 *   scattered hour followed by quiet cools smoothly. 14 points is a full churn.
 *
 * The level is the worse of the two (Calm under 50%, Busy from 50%, Full from 100%), and `driver` says which one set
 * it. The constants are judgement calls from the research in the spec (reading speed is Brysbaert 2019; the switch
 * costs, the 15-minute fade and the caps are unsourced and to be refit against people's own "felt heavy / fine").
 */

/** Something the person did, recorded on their device (never sent anywhere): the raw input to churn. */
export interface LoadActivity {
	/** ISO time. */
	at: string;
	/** `view`: the chat came on screen; `away`: it left the screen (the app was put down or closed the chat); `read`: messages read (`words`); `answer`: a question answered; `task`: a task done, given back or moved. */
	kind: "view" | "away" | "read" | "answer" | "task";
	chatId: string;
	words?: number;
	/** Trigger events skimmed with the read. */
	events?: number;
}

export type HumanLoadLevel = "calm" | "busy" | "full";

/** What is waiting on you now. */
export interface Backlog {
	tasks: number;
	questions: number;
	/** Attention minutes it will take. */
	minutes: number;
	/** minutes / 12; 1 is full. */
	utilisation: number;
}

/** How scattered the recent past was, faded. */
export interface Churn {
	/** points / 14; 1 is full. */
	utilisation: number;
	/** Chat changes you stayed through, in the last hour, and how many of them a Dev's message had just pulled you into. */
	switches: number;
	pulled: number;
	/** Chats you spent time in this hour. */
	chats: number;
	/** Words that arrived in chats you read this hour. */
	words: number;
	/** Questions answered and tasks moved this hour. */
	answers: number;
}

export interface HumanLoad {
	/** The worse of backlog and churn; can pass 1. */
	utilisation: number;
	level: HumanLoadLevel;
	/** Which signal set the level; null while Calm. */
	driver: "waiting" | "switching" | null;
	backlog: Backlog;
	churn: Churn;
}

export const COST = {
	question: 1.5,
	task: 2,
	readWpm: 220,
	/** Skimmed, not read: chat, events and Dev output are scanned. */
	skim: 0.5,
	switchSelf: 1,
	switchPulled: 2,
	extraChat: 1,
	answer: 1,
	taskAction: 1,
	eventSkim: 0.25,
} as const;
const FREE_CHATS = 2;
const HALF_LIFE_MIN = 15;
const BACKLOG_FULL = 12;
const CHURN_FULL = 14;
/** Shorter than this on a chat is a glance, not a switch. */
const GLANCE_MS = 15_000;
/** A message this recent before you opened the chat is what pulled you there. */
const PULL_MS = 3 * 60_000;
/** A visit with no activity in it counts for this long: an idle screen isn't attention. */
const QUIET_VISIT_MS = 30_000;
/** After the last thing done in a visit, the screen counts this much longer. */
const LINGER_MS = 3 * 60_000;
const HOUR_MS = 60 * 60_000;
export const CALM_BELOW = 0.5;
export const FULL_AT_UTILISATION = 1;

/** Attention minutes a thing waiting on you will take. */
export function waitingMinutes(items: NeedItem[]): number {
	return items.reduce(
		(sum, i) => sum + (i.kind === "question" ? COST.question : COST.task),
		0,
	);
}

/** The level for a utilisation. */
export function utilisationLevel(u: number): HumanLoadLevel {
	return u >= FULL_AT_UTILISATION ? "full" : u >= CALM_BELOW ? "busy" : "calm";
}

interface Visit {
	chatId: string;
	start: number;
	/** Until another chat, an away, or now. */
	end: number;
	/** Until the person stopped doing anything in it. */
	eff: number;
	words: number;
	events: number;
	dwelt: boolean;
	pulled: boolean;
}

/** The chat on screen over time, from the views and aways in the log (oldest first) up to `t`. */
function visitsOf(log: LoadActivity[], state: ChatState, t: number): Visit[] {
	const marks: { chatId: string; start: number; end: number }[] = [];
	for (const a of log) {
		const at = Date.parse(a.at);
		const last = marks.at(-1);
		if (a.kind === "view") {
			if (last && last.end === t && last.chatId === a.chatId) continue;
			if (last && last.end === t) last.end = at;
			marks.push({ chatId: a.chatId, start: at, end: t });
		} else if (
			a.kind === "away" &&
			last &&
			last.end === t &&
			last.chatId === a.chatId
		)
			last.end = at;
	}
	return marks.map((m) => {
		const inside = log.filter(
			(a) =>
				a.chatId === m.chatId &&
				a.kind !== "view" &&
				a.kind !== "away" &&
				Date.parse(a.at) >= m.start &&
				Date.parse(a.at) <= m.end,
		);
		const lastAct = inside.reduce(
			(max, a) => Math.max(max, Date.parse(a.at)),
			m.start,
		);
		const eff =
			inside.length > 0
				? Math.min(m.end, lastAct + LINGER_MS)
				: Math.min(m.end, m.start + QUIET_VISIT_MS);
		const pulled = state.messages.some(
			(msg) =>
				msg.chatId === m.chatId &&
				msg.authorId !== state.meId &&
				Date.parse(msg.at) <= m.start &&
				m.start - Date.parse(msg.at) <= PULL_MS,
		);
		return {
			chatId: m.chatId,
			start: m.start,
			end: m.end,
			eff,
			words: inside.reduce(
				(n, a) => n + (a.kind === "read" ? (a.words ?? 0) : 0),
				0,
			),
			events: inside.reduce(
				(n, a) => n + (a.kind === "read" ? (a.events ?? 0) : 0),
				0,
			),
			dwelt: m.end - m.start >= GLANCE_MS,
			pulled,
		};
	});
}

/** The person's load now. `activity` is their device's log (any order, any age); `today` their local date. */
export function humanLoad(
	state: ChatState,
	activity: LoadActivity[],
	now: Date,
	today: string,
): HumanLoad {
	const t = now.getTime();
	const fade = (at: number) =>
		0.5 ** (Math.max(0, t - at) / 60_000 / HALF_LIFE_MIN);
	const log = activity
		.filter((a) => Date.parse(a.at) <= t)
		.sort((a, b) => a.at.localeCompare(b.at));
	const visits = visitsOf(log, state, t);

	let points = 0;
	let switches = 0;
	let pulled = 0;
	let words = 0;
	const touched = new Map<string, number>();
	visits.forEach((v, i) => {
		if (i > 0 && v.dwelt) {
			points +=
				(v.pulled ? COST.switchPulled : COST.switchSelf) * fade(v.start);
			if (t - v.start <= HOUR_MS) {
				switches++;
				if (v.pulled) pulled++;
			}
		}
		if (v.dwelt)
			touched.set(v.chatId, Math.max(touched.get(v.chatId) ?? 0, v.start));
		// Skimmed, and never more than most of the time the chat was on screen: opening a long backlog isn't reading it all.
		const readMinutes = Math.min(
			(v.words / COST.readWpm) * COST.skim + v.events * COST.eventSkim,
			0.8 * ((v.eff - v.start) / 60_000),
		);
		points += readMinutes * fade(v.eff);
		if (t - v.eff <= HOUR_MS) words += v.words;
	});
	// Reads with no visit around them (a device that doesn't log the chat on screen) are charged from their own words.
	for (const a of log) {
		if (
			a.kind !== "read" ||
			visits.some(
				(v) =>
					v.chatId === a.chatId &&
					Date.parse(a.at) >= v.start &&
					Date.parse(a.at) <= v.end,
			)
		)
			continue;
		points +=
			((a.words ?? 0) / COST.readWpm) * COST.skim * fade(Date.parse(a.at)) +
			(a.events ?? 0) * COST.eventSkim * fade(Date.parse(a.at));
		if (t - Date.parse(a.at) <= HOUR_MS) words += a.words ?? 0;
	}
	// Chats beyond the first couple add load, each fading as you leave it, so one leaving never steps the number.
	const spread = [...touched.values()].reduce((sum, at) => sum + fade(at), 0);
	points += Math.max(0, spread - FREE_CHATS) * COST.extraChat;
	let answers = 0;
	for (const a of log) {
		if (a.kind !== "answer" && a.kind !== "task") continue;
		points +=
			(a.kind === "answer" ? COST.answer : COST.taskAction) *
			fade(Date.parse(a.at));
		if (t - Date.parse(a.at) <= HOUR_MS) answers++;
	}
	const chats = new Set(
		visits.filter((v) => v.dwelt && t - v.end <= HOUR_MS).map((v) => v.chatId),
	).size;

	const items = needsYou(state, today, now).items;
	const tasks = items.filter((i) => i.kind === "task").length;
	const minutes = waitingMinutes(items);
	const backlog: Backlog = {
		tasks,
		questions: items.length - tasks,
		minutes,
		utilisation: minutes / BACKLOG_FULL,
	};
	const churn: Churn = {
		utilisation: points / CHURN_FULL,
		switches,
		pulled,
		chats,
		words,
		answers,
	};

	const utilisation = Math.max(backlog.utilisation, churn.utilisation);
	const level = utilisationLevel(utilisation);
	const driver =
		level === "calm"
			? null
			: churn.utilisation > backlog.utilisation
				? "switching"
				: "waiting";
	return { utilisation, level, driver, backlog, churn };
}

/** One chat's share of your attention: what's waiting on you there, against the same backlog scale. */
export function chatLoad(
	state: ChatState,
	chatId: string,
	now: Date,
	today: string,
): { minutes: number; utilisation: number; level: HumanLoadLevel } {
	const minutes = waitingMinutes(
		needsYou(state, today, now).items.filter((i) => i.chatId === chatId),
	);
	const utilisation = minutes / BACKLOG_FULL;
	return { minutes, utilisation, level: utilisationLevel(utilisation) };
}

/** "Calm", "Busy", "Full". */
export const LOAD_WORD: Record<HumanLoadLevel, string> = {
	calm: "Calm",
	busy: "Busy",
	full: "Full",
};
