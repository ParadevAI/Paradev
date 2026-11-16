import type { ChatState } from "../chat-state/chat-state.ts";
import { chatDevs, ownedByGroup } from "../devs/devs.ts";
import type { App, Chat, Dev, Message, Task } from "../model/model.ts";

/**
 * Which Dev a chat's info shows: one Dev's own tasks, triggers, sketches, files and browser, or the whole chat
 * (`null`). Each Dev's are the ones it does, made or shared itself.
 */
export type DevScope = string | null;

/** Whether an item belonging to `devId` (none when null) is in the scope. */
export const inDevScope = (
	scope: DevScope,
	devId: string | null | undefined,
): boolean => scope === null || scope === devId;

/** The tasks a scope shows: those a Dev is doing, for one Dev; all of them for the whole chat. */
export const tasksInScope = (tasks: Task[], scope: DevScope): Task[] =>
	scope === null ? tasks : tasks.filter((task) => task.assigneeDevId === scope);

/** The sketches a scope shows: those a Dev first published, for one Dev. */
export const appsInScope = (apps: App[], scope: DevScope): App[] =>
	scope === null ? apps : apps.filter((app) => app.creatorDevId === scope);

/**
 * The files a scope shows, the chat's messages that share one (voice notes excluded: they're in the thread only), for
 * one Dev the ones it shared; a person's shares show only for the whole chat.
 */
export const filesInScope = (messages: Message[], scope: DevScope): Message[] =>
	messages.filter(
		(m) =>
			m.file &&
			!m.voice &&
			(scope === null ||
				(m.file.sharedBy?.kind === "dev" && m.file.sharedBy.id === scope)),
	);

/**
 * The Devs a chat's info can be scoped to: a 1:1's one, and in a group only the group's own (its own Dev and the
 * ones added to it). Members' Devs there are theirs, with folders and browsers only their owners open, so the info
 * never offers them.
 */
export function scopeDevs(state: ChatState, chat: Chat): Dev[] {
	const devs = chatDevs(state, chat);
	return chat.kind === "group" ? devs.filter(ownedByGroup) : devs;
}

/** The scope the info shows: the viewer's pick while it's still offered, else the group's own Dev; with one Dev, all. */
export function infoScope(devs: Dev[], picked: DevScope | undefined): DevScope {
	if (devs.length < 2) return null;
	if (picked === null) return null;
	if (picked !== undefined && devs.some((m) => m.id === picked)) return picked;
	return (devs.find((m) => m.kind === "group") ?? devs[0])!.id;
}
