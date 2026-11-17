import type { ChatState } from "../chat-state/chat-state.ts";
import { chatTitle } from "../devs/devs.ts";
import { needsYou } from "../needs-you/needs-you.ts";
import {
	type HumanLoad,
	type HumanLoadLevel,
	LOAD_WORD,
	utilisationLevel,
} from "./human-load.ts";

/** One of the two readings, with what it's made of in counts a person can check. */
export interface LoadSignal {
	label: string;
	utilisation: number;
	level: HumanLoadLevel;
	detail: string;
	/** More lines under the detail. */
	rows: string[];
	/** For what's waiting: the chats it's in, most first. */
	chats?: { chatId: string; title: string; items: number }[];
}

const plural = (n: number, word: string, many = `${word}s`) =>
	`${n} ${n === 1 ? word : many}`;
const words = (n: number) =>
	`about ${(Math.round(n / 100) * 100).toLocaleString("en")} words`;

/** The load's two readings in plain counts, so the percentage is never a mystery. Quiet ones still show, as a calm line. */
export function loadSignals(
	state: ChatState,
	load: HumanLoad,
	now: Date,
	today: string,
): { waiting: LoadSignal; switching: LoadSignal } {
	const { backlog, churn } = load;
	const byChat = new Map<string, number>();
	for (const i of needsYou(state, today, now).items)
		byChat.set(i.chatId, (byChat.get(i.chatId) ?? 0) + 1);
	const chats = [...byChat.entries()]
		.map(([chatId, items]) => ({
			chatId,
			items,
			title: (() => {
				const chat = state.chats.find((c) => c.id === chatId);
				return chat ? chatTitle(state, chat) : "A chat";
			})(),
		}))
		.sort((a, b) => b.items - a.items);
	const waitingDetail = [
		backlog.questions && plural(backlog.questions, "question"),
		backlog.tasks && plural(backlog.tasks, "task"),
	]
		.filter(Boolean)
		.join(" · ");

	const rows: string[] = [];
	if (churn.words >= 200)
		rows.push(`${words(churn.words)} arrived in chats you read`);
	if (churn.answers > 0)
		rows.push(`${plural(churn.answers, "answer")} and task changes`);
	const pulled =
		churn.pulled > 0 ? `, ${churn.pulled} right after a Dev wrote` : "";
	return {
		waiting: {
			label: "Waiting on you",
			utilisation: backlog.utilisation,
			level: utilisationLevel(backlog.utilisation),
			detail: waitingDetail || "Nothing open",
			rows: [],
			chats,
		},
		switching: {
			label: "Switching & catching up",
			utilisation: churn.utilisation,
			level: utilisationLevel(churn.utilisation),
			detail: churn.switches
				? `${plural(churn.switches, "switch", "switches")} across ${plural(churn.chats, "chat")} this hour${pulled}`
				: churn.chats
					? `Time in ${plural(churn.chats, "chat")} this hour`
					: "A quiet hour",
			rows,
		},
	};
}

/** The card's headline and the line under it, said the same on both apps. */
export function loadHeadline(load: HumanLoad): {
	title: string;
	subtitle: string;
} {
	const word = LOAD_WORD[load.level];
	if (load.driver === null)
		return { title: word, subtitle: "Nothing is asking much of you." };
	if (load.driver === "waiting") {
		const n = load.backlog.questions + load.backlog.tasks;
		return {
			title: `${word} · from waiting`,
			subtitle: `${plural(n, "thing")} waiting on you.`,
		};
	}
	return {
		title: `${word} · from switching`,
		subtitle:
			load.backlog.questions + load.backlog.tasks === 0
				? "Nothing is waiting on you. The hour was scattered."
				: "Mostly how scattered the last hour was.",
	};
}

/** How the level is read, said the same on both apps. */
export const LOAD_SCALE_NOTE =
	"Busy from half, Full when either reading is full. Switching fades over about 15 minutes; a chat you only glance at doesn't count.";
