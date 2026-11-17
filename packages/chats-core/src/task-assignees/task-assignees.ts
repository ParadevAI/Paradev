import type { ChatState } from "../chat-state/chat-state.ts";
import { chatDevs } from "../devs/devs.ts";
import type { Chat, Task } from "../model/model.ts";

export type TaskAssignee =
	| { kind: "user"; id: string; name: string }
	| { kind: "dev"; id: string; name: string; color: string };

/**
 * Who a task in this chat can be given to: its people, and the Devs that may work here. A 1:1's Dev; in a group,
 * the group's Dev and your own Devs the group let in. Another member's Dev isn't offered: it would work (and
 * spend) on its owner's behalf, so only its owner assigns it.
 */
export function taskAssigneeOptions(
	state: ChatState,
	chat: Chat,
): TaskAssignee[] {
	const people = chat.memberIds.flatMap((id): TaskAssignee[] => {
		const member = state.members[id];
		return member
			? [{ kind: "user", id, name: id === state.meId ? "You" : member.name }]
			: [];
	});
	const devs = chatDevs(state, chat)
		.filter(
			(m) =>
				chat.kind === "direct" ||
				m.kind === "group" ||
				m.ownerId === state.meId,
		)
		.map(
			(m): TaskAssignee => ({
				kind: "dev",
				id: m.id,
				name: m.name,
				color: m.color,
			}),
		);
	return [...devs, ...people];
}

/** The task's assignee as shown on it, or null when nobody has it. */
export function taskAssignee(
	state: ChatState,
	task: Pick<Task, "assigneeId" | "assigneeDevId">,
): TaskAssignee | null {
	if (task.assigneeDevId) {
		const dev = state.devs[task.assigneeDevId];
		return dev
			? {
					kind: "dev",
					id: dev.id,
					name: dev.name,
					color: dev.color,
				}
			: null;
	}
	if (task.assigneeId) {
		const member = state.members[task.assigneeId];
		return member
			? {
					kind: "user",
					id: member.id,
					name: task.assigneeId === state.meId ? "You" : member.name,
				}
			: null;
	}
	return null;
}
