import { briefsOf } from "../chat-briefs/chat-briefs.ts";
import type { ChatState } from "../chat-state/chat-state.ts";
import { pileWords } from "../needs-you/needs-you.ts";
import type { ChatGlance } from "./chat-glance.ts";

/** One short point on a chat's catch-up; `from` says whether the app worked it out or the Dev wrote it in its brief. */
export interface GlancePoint {
	key: string;
	text: string;
	from: "app" | "brief";
}

/** A chat's catch-up as three short lists: what needs you, what the Devs are on, and what got done today. */
export interface GlancePoints {
	needsYou: GlancePoint[];
	onIt: GlancePoint[];
	done: GlancePoint[];
	/** When the Dev last wrote the points that came from its brief; null without one. */
	briefAt: string | null;
	/** The chat moved on after the brief: someone else wrote here a while after it (`STALE_AFTER_MS`). */
	briefStale: boolean;
}

const ON_IT_MAX = 3;
/**
 * A brief is written during a turn whose reply lands just after it, and people often answer right away, so only a
 * message from someone else this long after the brief means the chat has moved on without it.
 */
const STALE_AFTER_MS = 30 * 60_000;
const DONE_MAX = 3;
const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Topics that only restate the group they land in ("Waiting on you" under Needs you): their line says it all. */
const SAYS_NEEDS_YOU = /^(waiting on you|needs you|for you|your call)$/i;

/**
 * The glance's points, a line each, in three groups as the summary card shows them. What needs you starts with what the
 * app counts (each open question, the tasks due as one point) and then what the Dev's brief says needs someone (a
 * topic that only says so, "Waiting on you", gives way to its line); what the Devs are on is their tasks in progress
 * (named by Dev when the chat has several), then the rest of the brief; done is the tasks finished since
 * `dayStart`, the viewer's local midnight as an ISO time.
 */
export function glancePoints(
	state: ChatState,
	chatId: string,
	glance: ChatGlance,
	dayStart: string,
): GlancePoints {
	const name = (devId: string | null) =>
		(devId && state.devs[devId]?.name) || "A Dev";
	const brief = briefsOf(state, chatId)[0];
	const topic = (t: { topic: string; line: string; needsYou: boolean }) =>
		t.needsYou && SAYS_NEEDS_YOU.test(t.topic.trim())
			? capitalised(t.line)
			: `${t.topic}: ${t.line}`;
	// With one Dev in the chat the group's heading names it, so its tasks needn't.
	const oneDev =
		(state.chats.find((c) => c.id === chatId)?.devIds.length ?? 0) <= 1;

	const questions = glance.needs.filter((n) => n.kind === "question");
	const tasks = glance.needs.filter((n) => n.kind === "task");
	const needsYou: GlancePoint[] = [
		...questions.map((q) => ({
			key: `question:${q.messageId}`,
			text: `${name(q.devId)} asks: ${q.title}`,
			from: "app" as const,
		})),
		...(tasks.length === 1
			? [
					{
						key: `task:${tasks[0]!.taskId}`,
						text: `${tasks[0]!.title}${tasks[0]!.late ? ", late" : ", due today"}`,
						from: "app" as const,
					},
				]
			: tasks.length > 1
				? [
						{
							key: "tasks",
							text: capitalised(pileWords(tasks)),
							from: "app" as const,
						},
					]
				: []),
		...(brief?.topics
			.filter((t) => t.needsYou)
			.map((t, i) => ({
				key: `brief:need:${i}`,
				text: topic(t),
				from: "brief" as const,
			})) ?? []),
	];

	const onIt: GlancePoint[] = [
		...glance.working.slice(0, ON_IT_MAX).map((t) => ({
			key: `task:${t.id}`,
			text: oneDev ? t.title : `${name(t.assigneeDevId)}: ${t.title}`,
			from: "app" as const,
		})),
		...(brief?.topics
			.filter((t) => !t.needsYou)
			.map((t, i) => ({
				key: `brief:on:${i}`,
				text: topic(t),
				from: "brief" as const,
			})) ?? []),
	];

	const done: GlancePoint[] = state.tasks
		.filter(
			(t) =>
				t.chatId === chatId &&
				t.status === "done" &&
				(t.completedAt ?? "") >= dayStart,
		)
		.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
		.slice(0, DONE_MAX)
		.map((t) => ({ key: `task:${t.id}`, text: t.title, from: "app" as const }));

	const briefStale =
		!!brief &&
		state.messages.some(
			(m) =>
				m.chatId === chatId &&
				m.authorDevId !== brief.devId &&
				Date.parse(m.at) - Date.parse(brief.updatedAt) > STALE_AFTER_MS,
		);
	return {
		needsYou,
		onIt,
		done,
		briefAt: brief?.updatedAt ?? null,
		briefStale,
	};
}
