import { db } from "@superset/db/client";
import {
	chatsAgents,
	chatsGroupMembers,
	chatsGroups,
	chatsQuestions,
	chatsTaskNotes,
	users,
} from "@superset/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { formatTime, turnHeader } from "../turns/turn-header";
import { toUser } from "../views";
import {
	addNotes,
	findChatTask,
	publishTask,
	setTaskStatus,
} from "./task-store";

/** As many of a task's latest notes as its turn reads. */
const NOTES_EXCERPT = 10;

/**
 * A task's turn: which task, in which chat, who asked, where it stands and
 * what was noted on it so far, then how to work on it. Null when the task is
 * gone.
 */
export async function taskTurnText(
	taskId: string,
	now: Date,
): Promise<{ text: string; userId: string | null } | null> {
	const found = await findChatTask(taskId);
	if (!found) return null;
	const { task, chat } = found;
	const [[group], people, [creator], [creatorDev], notes] = await Promise.all([
		db.select().from(chatsGroups).where(eq(chatsGroups.id, chat.groupId)),
		db
			.select({ user: users })
			.from(chatsGroupMembers)
			.innerJoin(users, eq(users.id, chatsGroupMembers.userId))
			.where(eq(chatsGroupMembers.groupId, chat.groupId)),
		db.select().from(users).where(eq(users.id, task.creatorId)),
		chat.createdByAgentId
			? db
					.select({ name: chatsAgents.name })
					.from(chatsAgents)
					.where(eq(chatsAgents.id, chat.createdByAgentId))
			: [],
		db
			.select()
			.from(chatsTaskNotes)
			.where(eq(chatsTaskNotes.taskId, taskId))
			.orderBy(desc(chatsTaskNotes.createdAt))
			.limit(NOTES_EXCERPT),
	]);
	if (!group) return null;
	const due =
		chat.scheduledAt !== null && chat.scheduledAt.getTime() <= now.getTime();
	const reminder = due && chat.remind;
	const when = chat.scheduledAt
		? `scheduled for ${formatTime(chat.scheduledAt)}${chat.remind ? " (a reminder)" : ""}`
		: task.dueDate
			? `due ${task.dueDate.toISOString().slice(0, 10)}`
			: null;
	const header = turnHeader(
		reminder ? "Task reminder" : due ? "Scheduled task" : "Task",
		[
			[
				"Chat",
				group.kind === "direct"
					? `your 1:1 with ${people.map(({ user }) => toUser(user).displayName).join(", ") || "its owner"}`
					: `the group "${group.title}"`,
			],
			["Task", `${task.id} "${task.title}"`],
			[
				"Asked by",
				creatorDev?.name ?? (creator ? toUser(creator).displayName : "someone"),
			],
			["Status", [found.status, when].filter(Boolean).join(", ")],
			["Time", formatTime(now)],
		],
	);
	const log = notes
		.reverse()
		.map(
			(note) =>
				`- ${formatTime(note.createdAt)} ${note.kind}${note.text ? `: ${note.text}` : ""}`,
		);
	return {
		userId: task.creatorId,
		text: [
			header,
			...(task.description ? [task.description] : []),
			...(log.length
				? [`Its activity so far (oldest first):\n${log.join("\n")}`]
				: []),
			...(reminder
				? [
						"It's this task's reminder time. Remind whoever it's for in the chat now with `send_update` (mention them; if it's for your owner in your 1:1, just tell them), then do any part of it you can.",
					]
				: []),
			`Do the work now. Post what people should see in the chat with \`send_update\` (a line when there's progress worth knowing, then the result, as short as it can be); your final message goes on the task as your note, not in the chat. Comment on the task only what someone looking at it later needs, not every step: \`dev task comment ${task.id} "<note>"\`. The task is marked done when this turn ends, so say in the chat anything people need to know or do. If you need something from a person first, ask with the question tool (the task waits for the answer). If it can't be finished now (blocked on someone, or it failed), say so in the chat and \`dev task update ${task.id} --status todo\` so it stays open.`,
		].join("\n\n"),
	};
}

/** The task's Dev started on it: to do → in progress, noted once. */
export async function markTaskStarted(taskId: string, agentId: string) {
	const found = await findChatTask(taskId);
	if (!found || found.status !== "todo") return;
	const moved = await setTaskStatus(
		found,
		"in_progress",
		{ kind: "dev", agentId, userId: null },
		{ kind: "started" },
	);
	if (moved) await publishTask(taskId);
}

/** Whether a question about the task is still open with its turn let go, so its answer starts a new turn. */
async function waitsOnAnswer(taskId: string) {
	const [open] = await db
		.select({ id: chatsQuestions.id })
		.from(chatsQuestions)
		.where(
			and(
				eq(chatsQuestions.taskId, taskId),
				eq(chatsQuestions.status, "open"),
				eq(chatsQuestions.turnWaiting, false),
			),
		)
		.limit(1);
	return open !== undefined;
}

/**
 * The task's turn ended. A task its Dev left in progress is done: what people
 * need was said in the chat. It stays in progress while it waits on an answer,
 * and one whose turn failed goes back to to do with the reason. One the Dev
 * finished or put back itself is left as it is. The Dev's last words become
 * its note on the task.
 */
export async function markTaskTurnEnded(
	turn: { id: string; taskId: string; agentId: string },
	result: { error: string | null; superseded: boolean; answer: string | null },
) {
	const found = await findChatTask(turn.taskId);
	if (!found || result.superseded) return;
	const actor = { kind: "dev" as const, agentId: turn.agentId, userId: null };
	const answer = result.answer?.trim();
	if (answer && !result.error) {
		await addNotes(found, actor, [{ kind: "progress", text: answer }]);
	}
	if (!result.error && (await waitsOnAnswer(turn.taskId))) return;
	if (result.error) {
		const moved =
			found.status === "in_progress" &&
			(await setTaskStatus(found, "todo", actor, {
				kind: "failed",
				text: result.error,
			}));
		if (!moved) {
			await addNotes(found, actor, [{ kind: "failed", text: result.error }]);
		}
	} else if (found.status === "in_progress") {
		await setTaskStatus(found, "done", actor, { kind: "done" });
	} else {
		return;
	}
	await publishTask(turn.taskId);
}
