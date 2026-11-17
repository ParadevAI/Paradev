import {
	type App,
	type Chat,
	type ChatBrief,
	type ChatRead,
	type ChatState,
	type Dev,
	type Member,
	type Message,
	parseViewSpec,
	type SavedTaskView,
	type Task,
	type TriggerBatch,
} from "@superset/chats-core";
import type {
	ApiApp,
	ApiChatBrief,
	ApiChatRead,
	ApiDev,
	ApiGroup,
	ApiGroupDev,
	ApiMessage,
	ApiTask,
	ApiTaskView,
	ApiTriggerBatch,
	ApiUser,
	Bootstrap,
} from "../api-types/api-types.ts";

export const toMember = (user: ApiUser): Member => ({
	id: user.id,
	name: user.displayName,
});

export const toDev = (m: ApiDev): Dev => ({
	id: m.id,
	kind: m.kind,
	name: m.name,
	color: m.color,
	ownerId: m.ownerUserId,
	description: m.description,
	// Always set, so an update merged over the Dev held (`upsertDev`) takes a look back to automatic.
	look: m.look ?? null,
	voice: m.voice ?? null,
	listing: m.listing ?? null,
	...(m.descriptionText !== undefined
		? { descriptionText: m.descriptionText }
		: {}),
	...(m.paradevAccess !== undefined ? { paradevAccess: m.paradevAccess } : {}),
});

export function toChat(g: ApiGroup, links: ApiGroupDev[]): Chat {
	const own = links.filter((l) => l.groupId === g.id);
	const addedBy = Object.fromEntries(
		own.flatMap((l) => (l.addedBy ? [[l.devId, l.addedBy]] : [])),
	);
	return {
		id: g.id,
		title: g.title,
		kind: g.kind,
		memberIds: g.members.map((m) => m.id),
		ownerIds: g.members.filter((m) => m.role === "owner").map((m) => m.id),
		devIds: own.map((l) => l.devId),
		...(Object.keys(addedBy).length ? { devAddedBy: addedBy } : {}),
	};
}

export const toMessage = (m: ApiMessage): Message => ({
	id: m.id,
	...(m.clientId ? { clientId: m.clientId } : {}),
	chatId: m.groupId,
	authorId: m.authorId,
	...(m.authorDevId ? { authorDevId: m.authorDevId } : {}),
	text: m.text,
	at: m.at,
	...(m.taskId ? { taskId: m.taskId } : {}),
	...(m.appId
		? { appId: m.appId, ...(m.appVersion ? { appVersion: m.appVersion } : {}) }
		: {}),
	...(m.turnId ? { turnId: m.turnId } : {}),
	...(m.question ? { question: m.question } : {}),
	...(m.file ? { file: m.file } : {}),
	...(m.replyTo ? { replyTo: m.replyTo } : {}),
	...(m.voice ? { voice: m.voice } : {}),
	...(m.call ? { call: m.call } : {}),
	...(m.editedAt ? { editedAt: m.editedAt } : {}),
	...(m.viaKey ? { viaKey: m.viaKey } : {}),
});

/** A saved view as the apps keep it; the spec is read as the apps read any stored one. */
export const toTaskView = (v: ApiTaskView): SavedTaskView => ({
	id: v.id,
	name: v.name,
	...parseViewSpec(v.spec),
});

export const toTask = (t: ApiTask): Task => ({
	id: t.id,
	chatId: t.groupId,
	title: t.title,
	description: t.description,
	// An API from before "Needs review" went may still send it: those tasks are in progress now.
	status: (t.status as string) === "needs_review" ? "in_progress" : t.status,
	assigneeId: t.assigneeId,
	assigneeDevId: t.assigneeDevId,
	due: t.due,
	scheduledAt: t.scheduledAt,
	remind: t.remind,
	labels: t.labels ?? [],
	links: t.links ?? [],
	repeat: t.repeat,
	createdAt: t.createdAt,
	completedAt: t.completedAt,
	createdBy: t.createdBy,
	createdByDevId: t.createdByDevId,
});

export const toApp = (a: ApiApp): App => ({
	id: a.id,
	chatId: a.groupId,
	name: a.name,
	description: a.description,
	color: a.color,
	status: a.status,
	version: a.version,
	url: a.url,
	creatorDevId: a.createdByDevId,
	saved: a.saved,
	createdAt: a.createdAt,
});

export const toTriggerBatch = (b: ApiTriggerBatch): TriggerBatch => ({
	id: b.id,
	chatId: b.groupId,
	triggerId: b.triggerId,
	toolkit: b.toolkit,
	count: b.count,
	at: b.at,
	outcome: b.outcome,
	finished: b.finished ?? true,
});

export const toChatRead = (r: ApiChatRead): ChatRead => ({
	chatId: r.groupId,
	reader: r.devId
		? { kind: "dev", id: r.devId }
		: { kind: "person", id: r.userId ?? "" },
	messageId: r.messageId,
	messageAt: r.messageAt,
	at: r.at,
});

export const toChatBrief = (b: ApiChatBrief): ChatBrief => ({
	chatId: b.groupId,
	devId: b.devId,
	topics: b.topics,
	updatedAt: b.updatedAt,
});

/** Maps `GET /bootstrap` onto the shape the UI renders. Messages are oldest first across chats. */
export function fromBootstrap(data: Bootstrap): ChatState {
	const members: Record<string, Member> = {
		[data.user.id]: toMember(data.user),
	};
	for (const group of data.groups)
		for (const user of group.members) members[user.id] = toMember(user);
	return {
		meId: data.user.id,
		members,
		devs: Object.fromEntries(data.devs.map((m) => [m.id, toDev(m)])),
		chats: data.groups.map((g) => toChat(g, data.groupDevs)),
		messages: data.messages
			.map(toMessage)
			.sort((a, b) => a.at.localeCompare(b.at)),
		tasks: data.tasks.map(toTask),
		apps: data.apps
			.map(toApp)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
		triggerBatches: (data.triggerBatches ?? [])
			.map(toTriggerBatch)
			.sort((a, b) => a.at.localeCompare(b.at)),
		olderMessages: Object.fromEntries(
			data.groupsWithOlderMessages.map((id) => [
				id,
				{ hasMore: true, loading: false },
			]),
		),
		reads: (data.reads ?? []).map(toChatRead),
		briefs: (data.briefs ?? []).map(toChatBrief),
		...(data.voiceNotes ? { voiceNotes: true } : {}),
		taskViews: (data.taskViews ?? []).map(toTaskView),
	};
}
