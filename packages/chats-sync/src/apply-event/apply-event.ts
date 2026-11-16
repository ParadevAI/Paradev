import {
	type Chat,
	type ChatState,
	type Dev,
	type Message,
	ownedByGroup,
	type Task,
	type TriggerBatch,
	withBrief,
	withFreshQuotes,
	withoutMessage,
	withQuestion,
	withRead,
} from "@superset/chats-core";
import type {
	AddedGroupDev,
	ApiApp,
	ApiDev,
	ApiGroup,
	CreatedApp,
	CreatedChat,
	RealtimeEvent,
	SentMessage,
} from "../api-types/api-types.ts";
import {
	toApp,
	toChat,
	toChatBrief,
	toChatRead,
	toDev,
	toMember,
	toMessage,
	toTask,
	toTaskView,
	toTriggerBatch,
} from "../from-api/from-api.ts";
import { localNoteId } from "../optimistic/optimistic.ts";

/**
 * Applies a server change to the state. Idempotent, because the same change arrives twice for our own writes: once as
 * the HTTP response and once on the realtime channel, in either order.
 */
export function applyEvent(state: ChatState, event: RealtimeEvent): ChatState {
	switch (event.type) {
		case "message.created":
			return applySentMessage(state, event);
		case "message.deleted":
			return withoutMessage(state, event.messageId);
		case "message.updated":
			return hasChat(state, event.message.groupId)
				? withFreshQuotes(
						upsertMessage(state, toMessage(event.message)),
						event.message.id,
					)
				: state;
		case "question.asked":
			return applySentMessage(state, { message: event.message, task: null });
		case "question.answered":
		case "question.closed":
			return withQuestion(state, event.question);
		case "task.updated":
			return hasChat(state, event.task.groupId)
				? upsertTask(state, toTask(event.task))
				: state;
		case "task.deleted":
			return removeTask(state, event.taskId);
		case "app.created":
			return applyCreatedApp(state, event);
		case "app.deleted":
			return state.apps.some((a) => a.id === event.appId)
				? { ...state, apps: state.apps.filter((a) => a.id !== event.appId) }
				: state;
		case "app.updated":
			return applyUpdatedApp(state, event.app);
		case "group.updated":
			return updateChat(state, event.group.id, (c) => ({
				...c,
				title: event.group.title,
			}));
		case "group.deleted":
			return removeGroup(state, event.groupId);
		case "member.joined":
			if (!hasChat(state, event.groupId)) return state;
			return updateChat(
				{
					...state,
					members: {
						...state.members,
						[event.member.id]: toMember(event.member),
					},
				},
				event.groupId,
				(c) =>
					c.memberIds.includes(event.member.id)
						? c
						: { ...c, memberIds: [...c.memberIds, event.member.id] },
			);
		case "dev.updated":
			return upsertDev(state, event.dev);
		case "dev.deleted":
			return removeDev(state, event.devId);
		case "group_dev.added":
			return applyAddedGroupDev(state, event);
		case "group_dev.removed":
			return updateChat(state, event.groupId, (c) => ({
				...c,
				devIds: c.devIds.filter((id) => id !== event.devId),
			}));
		case "trigger.batch":
			return hasChat(state, event.batch.groupId)
				? upsertTriggerBatch(state, toTriggerBatch(event.batch))
				: state;
		case "task_views.changed":
			return { ...state, taskViews: event.views.map(toTaskView) };
		case "chat.read":
			return hasChat(state, event.groupId)
				? withRead(state, toChatRead(event))
				: state;
		case "chat.brief":
			return hasChat(state, event.groupId)
				? withBrief(state, toChatBrief(event))
				: state;
		// `app.storage` is for the app's frame, `task.activity` for an open task's detail, `trigger.changed`/`.deleted` for
		// the triggers screens, and status/turn events for the live view, all through the store's signals;
		// on `groups.changed` the store refreshes its realtime token and re-bootstraps. A newer server may also publish
		// events this build doesn't know; dropping them beats losing the whole state.
		default:
			return state;
	}
}

/**
 * A bootstrap snapshot plus the events heard while it was in flight, in order. The snapshot may have been read before
 * some of them; since events are idempotent and arrive in order, replaying them all leaves the newest state.
 */
export const replayEvents = (fresh: ChatState, events: RealtimeEvent[]) =>
	events.reduce(applyEvent, fresh);

export function applyAddedGroupDev(
	state: ChatState,
	{ groupDev, dev }: AddedGroupDev,
): ChatState {
	if (!hasChat(state, groupDev.groupId)) return state;
	return updateChat(upsertDev(state, dev), groupDev.groupId, (c) => {
		const devIds = c.devIds.includes(dev.id) ? c.devIds : [...c.devIds, dev.id];
		if (!groupDev.addedBy) return devIds === c.devIds ? c : { ...c, devIds };
		return {
			...c,
			devIds,
			devAddedBy: { ...c.devAddedBy, [dev.id]: groupDev.addedBy },
		};
	});
}

/** Adds (or refreshes) a chat the user just created or joined, with its people and, if given, its Dev. */
export function applyGroup(
	state: ChatState,
	group: ApiGroup,
	created?: Pick<CreatedChat, "dev" | "groupDev">,
): ChatState {
	const members = { ...state.members };
	for (const user of group.members) members[user.id] = toMember(user);
	const existing = state.chats.find((c) => c.id === group.id);
	const devIds = [
		...new Set([
			...(existing?.devIds ?? []),
			...(created ? [created.groupDev.devId] : []),
		]),
	];
	const addedBy = {
		...existing?.devAddedBy,
		...(created?.groupDev.addedBy
			? { [created.groupDev.devId]: created.groupDev.addedBy }
			: {}),
	};
	const chat = {
		...toChat(group, []),
		devIds,
		...(Object.keys(addedBy).length ? { devAddedBy: addedBy } : {}),
	};
	const chats = existing
		? state.chats.map((c) => (c.id === group.id ? chat : c))
		: [...state.chats, chat];
	const next = { ...state, members, chats };
	return created ? upsertDev(next, created.dev) : next;
}

/**
 * Merges rather than replaces: a group channel carries what every member may see, so it must not wipe the description
 * text the owner's copy has, nor reword the owner's personal Dev as someone else's ("Alice's personal
 * Dev"): the owner's copy, which has `descriptionText`, keeps its own description.
 */
export function upsertDev(state: ChatState, incoming: ApiDev): ChatState {
	const existing = state.devs[incoming.id];
	const dev: Dev = { ...existing, ...toDev(incoming) };
	if (
		incoming.kind === "personal" &&
		incoming.descriptionText === undefined &&
		existing?.descriptionText !== undefined
	)
		dev.description = existing.description;
	return { ...state, devs: { ...state.devs, [dev.id]: dev } };
}

/** A deleted agent leaves every chat, and its 1:1 goes with it. */
export function removeDev(state: ChatState, devId: string): ChatState {
	if (!state.devs[devId]) return state;
	const { [devId]: _removed, ...devs } = state.devs;
	const chats = state.chats
		.filter((c) => !(c.kind === "direct" && c.devIds.includes(devId)))
		.map((c) =>
			c.devIds.includes(devId)
				? { ...c, devIds: c.devIds.filter((id) => id !== devId) }
				: c,
		);
	return { ...state, devs, chats };
}

/** A deleted group goes with everything in it, its own and added Devs included; members' Devs stay. */
export function removeGroup(state: ChatState, groupId: string): ChatState {
	const chat = state.chats.find((c) => c.id === groupId);
	if (!chat) return state;
	const devs = { ...state.devs };
	for (const id of chat.devIds)
		if (devs[id] && ownedByGroup(devs[id])) delete devs[id];
	return {
		...state,
		devs,
		chats: state.chats.filter((c) => c.id !== groupId),
		messages: state.messages.filter((m) => m.chatId !== groupId),
		tasks: state.tasks.filter((t) => t.chatId !== groupId),
		apps: state.apps.filter((a) => a.chatId !== groupId),
		...(state.triggerBatches
			? {
					triggerBatches: state.triggerBatches.filter(
						(b) => b.chatId !== groupId,
					),
				}
			: {}),
	};
}

function updateChat(
	state: ChatState,
	chatId: string,
	change: (chat: Chat) => Chat,
): ChatState {
	if (!hasChat(state, chatId)) return state;
	return {
		...state,
		chats: state.chats.map((c) => (c.id === chatId ? change(c) : c)),
	};
}

/** Swaps our optimistic copy (its id is the clientId) for the server's, or adds a message someone else sent. */
export function applySentMessage(
	state: ChatState,
	{ message, task }: SentMessage,
): ChatState {
	if (!hasChat(state, message.groupId)) return state;
	let next = state;
	const optimistic = message.clientId
		? next.messages.find((m) => m.id === message.clientId)
		: undefined;
	if (optimistic) {
		next = {
			...next,
			messages: next.messages.filter((m) => m !== optimistic),
			tasks: optimistic.taskId
				? next.tasks.filter((t) => t.id !== optimistic.taskId)
				: next.tasks,
		};
	}
	if (task) next = upsertTask(next, toTask(task));
	// The picture this device sent stays its own copy: drawing the server's link instead would blink while it loads.
	const localUri = optimistic?.localUri;
	return upsertMessage(
		next,
		localUri ? { ...toMessage(message), localUri } : toMessage(message),
	);
}

/** The app keeps its client-chosen id, so only our optimistic "You added…" note needs swapping for the server's. */
export function applyCreatedApp(
	state: ChatState,
	{ app, message }: CreatedApp,
): ChatState {
	if (!hasChat(state, app.groupId)) return state;
	const synced = toApp(app);
	const apps = state.apps.some((a) => a.id === app.id)
		? state.apps.map((a) => (a.id === app.id ? synced : a))
		: [...state.apps, synced];
	const withoutNote = {
		...state,
		apps,
		messages: state.messages.filter((m) => m.id !== localNoteId(app.id)),
	};
	return message ? upsertMessage(withoutNote, toMessage(message)) : withoutNote;
}

/**
 * A newer version replaces the app's entry. Events can arrive out of order (the restore's response and its event), so
 * an older version never overwrites a newer one.
 */
export function applyUpdatedApp(state: ChatState, incoming: ApiApp): ChatState {
	if (!hasChat(state, incoming.groupId)) return state;
	const app = toApp(incoming);
	const existing = state.apps.find((a) => a.id === app.id);
	if (!existing) return { ...state, apps: [...state.apps, app] };
	if ((existing.version?.number ?? 0) > (app.version?.number ?? 0))
		return state;
	return { ...state, apps: state.apps.map((a) => (a.id === app.id ? app : a)) };
}

function hasChat(state: ChatState, chatId: string) {
	return state.chats.some((c) => c.id === chatId);
}

/** Drops a task; messages that shared it keep their text (the card goes, as when the server unlinks it). */
export function removeTask(state: ChatState, taskId: string): ChatState {
	if (!state.tasks.some((t) => t.id === taskId)) return state;
	return { ...state, tasks: state.tasks.filter((t) => t.id !== taskId) };
}

export function upsertTask(state: ChatState, task: Task): ChatState {
	const exists = state.tasks.some((t) => t.id === task.id);
	return {
		...state,
		tasks: exists
			? state.tasks.map((t) => (t.id === task.id ? task : t))
			: [...state.tasks, task],
	};
}

/** Keeps messages in time order, so a late-arriving message lands where it belongs rather than at the bottom. */
function upsertMessage(state: ChatState, message: Message): ChatState {
	const existing = state.messages.find((m) => m.id === message.id);
	if (existing) {
		// The voice note's first event can arrive after its words: a transcribed note never goes back to transcribing.
		if (
			existing.voice &&
			existing.voice.status !== "transcribing" &&
			message.voice?.status === "transcribing"
		)
			return state;
		// The server never sends this device's own copy of a file; a later copy of the message keeps it.
		const next =
			existing.localUri && !message.localUri
				? { ...message, localUri: existing.localUri }
				: message;
		return {
			...state,
			messages: state.messages.map((m) => (m === existing ? next : m)),
		};
	}
	const messages = [...state.messages];
	let index = messages.length;
	while (index > 0 && messages[index - 1]!.at > message.at) index--;
	messages.splice(index, 0, message);
	return { ...state, messages };
}

/**
 * A batch arrives when its turn takes the events and again when it's done, with its outcome (or with no events, when
 * the turn gave them back). A replay can bring the first after the second, so a finished batch stays finished.
 */
function upsertTriggerBatch(state: ChatState, batch: TriggerBatch): ChatState {
	const batches = state.triggerBatches ?? [];
	const existing = batches.find((b) => b.id === batch.id);
	if (existing) {
		if (existing.finished && !batch.finished) return state;
		return {
			...state,
			triggerBatches: batches.map((b) => (b === existing ? batch : b)),
		};
	}
	return {
		...state,
		triggerBatches: [...batches, batch].sort((a, b) =>
			a.at.localeCompare(b.at),
		),
	};
}
