import type { ChatState } from "../chat-state/chat-state.ts";
import type { LoadLevel } from "../needs-you/needs-you.ts";
import type { ChatGlance } from "./chat-glance.ts";

/** A chat's catch-up in plain words: how heavy it is, then what's happening, a sentence each. */
export interface GlanceStory {
	/** "Calm", "Busy", "Full". */
	levelWord: string;
	/** What the level means for you today. */
	levelLine: string;
	/** What's happening, most pressing first. */
	lines: string[];
}

const LEVEL_WORD: Record<LoadLevel, string> = {
	calm: "Calm",
	busy: "Busy",
	full: "Full",
};

const quote = (s: string, max = 60) =>
	`“${s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s}”`;
const plural = (n: number, one: string, many = `${one}s`) =>
	n === 1 ? `1 ${one}` : `${n} ${many}`;

/**
 * Tells a chat's glance as sentences a person reads at once, not a list to work out: who handed you what, what's late,
 * who waits on you, what got finished, what's being worked on, and whether anything is new.
 */
export function glanceStory(state: ChatState, glance: ChatGlance): GlanceStory {
	const { needs, level, working, news } = glance;
	const name = (devId: string | null) =>
		(devId && state.devs[devId]?.name) || "A Dev";
	const lines: string[] = [];

	const questions = needs.filter((n) => n.kind === "question");
	if (questions.length === 1)
		lines.push(
			`${name(questions[0]!.devId)} is waiting on your answer to ${quote(questions[0]!.title)}.`,
		);
	else if (questions.length > 1)
		lines.push(`${questions.length} questions are waiting on your answer.`);

	const tasks = needs.filter((n) => n.kind === "task");
	if (tasks.length) {
		const from = new Set(tasks.map((t) => t.devId));
		const giver =
			from.size === 1 && tasks[0]!.devId ? name(tasks[0]!.devId) : null;
		const late = tasks.filter((t) => t.late).length;
		const label = commonLabel(
			state,
			tasks.map((t) => t.taskId!),
		);
		const what = label
			? plural(tasks.length, `${label} issue`)
			: plural(tasks.length, "task");
		const when =
			late === tasks.length
				? tasks.length === 1
					? "and it's late"
					: "all late"
				: late
					? `${late} of them late`
					: tasks.length === 1
						? "due today"
						: "all due today";
		if (tasks.length === 1)
			lines.push(
				giver
					? `${giver} gave you ${quote(tasks[0]!.title)}, ${when}.`
					: `${quote(tasks[0]!.title)} is yours, ${when}.`,
			);
		else
			lines.push(
				giver
					? `${giver} has given you ${what}, ${when}.`
					: `You have ${what} here, ${when}.`,
			);
	}

	if (working.length === 1)
		lines.push(
			`${name(working[0]!.assigneeDevId)} is working on ${quote(working[0]!.title)}.`,
		);
	else if (working.length > 1)
		lines.push(
			`${name(working[0]!.assigneeDevId)} is working on ${working.length} things.`,
		);

	const fresh = news?.messages.length ?? 0;
	lines.push(
		fresh
			? `${plural(fresh, "new message")} since you were last here.`
			: "Nothing new since you were last here.",
	);

	const levelLine =
		level === "full"
			? `Too much for one day: ${plural(needs.length, "thing")} waiting on you.`
			: level === "busy"
				? `${plural(needs.length, "thing")} waiting on you. Worth a sitting.`
				: needs.length
					? `${plural(needs.length, "small thing")} waiting on you.`
					: "Nothing is waiting on you here.";
	return { levelWord: LEVEL_WORD[level], levelLine, lines };
}

/** The label most of these tasks share ("linear"), capitalised, when at least half have it: what kind of work they are. */
function commonLabel(state: ChatState, taskIds: string[]): string | null {
	const counts = new Map<string, number>();
	for (const id of taskIds)
		for (const l of state.tasks.find((t) => t.id === id)?.labels ?? [])
			counts.set(l, (counts.get(l) ?? 0) + 1);
	const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
	if (!top || top[1] * 2 < taskIds.length) return null;
	return top[0].charAt(0).toUpperCase() + top[0].slice(1);
}
