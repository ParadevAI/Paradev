import {
	type App,
	type ChatState,
	type Dev,
	type Env,
	fileTypeFor,
	type Message,
	type MessageUpload,
	reduce,
	type Task,
	withRead,
} from "@superset/chats-core";

/**
 * Optimistic changes show the user's action before the server confirms it. Ids of things only this client has seen
 * start with `local-`, so a refresh can tell them from server rows and the confirmed copy can replace them.
 */
const LOCAL = "local-";

export const newClientId = () => `${LOCAL}${crypto.randomUUID()}`;
export const localTaskId = (clientId: string) => `${clientId}-task`;
export const localNoteId = (appId: string) => `${LOCAL}note-${appId}`;
export const isLocalId = (id: string) => id.startsWith(LOCAL);

/** Env for core's reducer that hands out the given ids in order, so optimistic rows get predictable local ids. */
function envWith(now: Date, ids: string[]): Env {
	const queue = [...ids];
	return {
		now: () => now,
		id: () => queue.shift() ?? `${LOCAL}${crypto.randomUUID()}`,
	};
}

/** The message's id is its clientId (and a shared task's is derived from it) so the server's copy can replace both. */
export function sendOptimistic(
	state: ChatState,
	input: {
		chatId: string;
		text: string;
		replyToId?: string;
		clientId: string;
		now: Date;
	},
): ChatState {
	const env = envWith(input.now, [input.clientId, localTaskId(input.clientId)]);
	return reduce(
		state,
		{
			type: "send",
			chatId: input.chatId,
			text: input.text,
			replyToId: input.replyToId,
		},
		env,
	);
}

/** A file (or voice note) on its way: what its bubble shows until the server's copy replaces it. */
export interface FileSendDraft {
	chatId: string;
	clientId: string;
	name: string;
	size: number;
	caption?: string;
	voice?: { durationMs: number; waveform: number[] };
	localUri?: string;
	now: Date;
}

/**
 * Shows a file this device is sending as its card at once, with its upload at 0: the message's and the file's id are
 * the clientId, so the server's copy takes its place (and its row) when it comes. A voice note's words come later.
 */
export function sendFileOptimistic(
	state: ChatState,
	input: FileSendDraft,
): ChatState {
	if (!state.chats.some((c) => c.id === input.chatId)) return state;
	const at = input.now.toISOString();
	const message: Message = {
		id: input.clientId,
		chatId: input.chatId,
		authorId: state.meId,
		text: input.voice ? "" : (input.caption?.trim() ?? ""),
		at,
		file: {
			id: input.clientId,
			chatId: input.chatId,
			name: input.name,
			title: "",
			mime: fileTypeFor(input.name)?.mime ?? "application/octet-stream",
			size: input.size,
			sharedBy: { kind: "user", id: state.meId },
			preview: "",
			createdAt: at,
		},
		...(input.voice
			? { voice: { ...input.voice, status: "transcribing" as const } }
			: {}),
		upload: { sent: 0, total: input.size },
		...(input.localUri ? { localUri: input.localUri } : {}),
	};
	return { ...state, messages: [...state.messages, message] };
}

/** Moves a sending file's upload on (or marks it failed); a message the server has already confirmed is left alone. */
export function setUpload(
	state: ChatState,
	clientId: string,
	upload: MessageUpload,
): ChatState {
	if (!state.messages.some((m) => m.id === clientId && m.upload)) return state;
	return {
		...state,
		messages: state.messages.map((m) =>
			m.id === clientId && m.upload ? { ...m, upload } : m,
		),
	};
}

/** A text message that gave up sending stays in the thread, marked like a failed file so both can be retried or dropped. */
export function setSendFailed(
	state: ChatState,
	clientId: string,
	error: string | null,
): ChatState {
	if (!state.messages.some((m) => m.id === clientId)) return state;
	const upload = error === null ? undefined : { sent: 0, total: 0, error };
	return {
		...state,
		messages: state.messages.map((m) =>
			m.id === clientId ? { ...m, upload } : m,
		),
	};
}

/** A sending voice note's words, once the device has them: shown at once, as the server will post them. */
export function setVoiceWords(
	state: ChatState,
	clientId: string,
	text: string,
): ChatState {
	return {
		...state,
		messages: state.messages.map((m) =>
			m.id === clientId && m.upload && m.voice
				? { ...m, text, voice: { ...m.voice, status: "done" } }
				: m,
		),
	};
}

export function createAppOptimistic(
	state: ChatState,
	input: {
		appId: string;
		chatId: string;
		name: string;
		description: string;
		now: Date;
	},
): ChatState {
	const { now, ...app } = input;
	return reduce(
		state,
		{ type: "create-app", ...app },
		envWith(now, [localNoteId(app.appId)]),
	);
}

export function rollbackSend(state: ChatState, clientId: string): ChatState {
	return {
		...state,
		messages: state.messages.filter((m) => m.id !== clientId),
		tasks: state.tasks.filter((t) => t.id !== localTaskId(clientId)),
	};
}

/** Applies (or, given the previous values, rolls back) a change to a task's own fields. */
export function setTaskFields(
	state: ChatState,
	taskId: string,
	fields: Partial<Omit<Task, "id" | "chatId">>,
): ChatState {
	return {
		...state,
		tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...fields } : t)),
	};
}

export function rollbackCreateApp(state: ChatState, appId: string): ChatState {
	return {
		...state,
		apps: state.apps.filter((a) => a.id !== appId),
		messages: state.messages.filter((m) => m.id !== localNoteId(appId)),
	};
}

export function setAppSaved(
	state: ChatState,
	appId: string,
	saved: boolean,
): ChatState {
	return {
		...state,
		apps: state.apps.map((a) => (a.id === appId ? { ...a, saved } : a)),
	};
}

/** Puts a deleted app back in its original place (apps are listed in creation order). */
export function restoreApp(state: ChatState, app: App): ChatState {
	if (state.apps.some((a) => a.id === app.id)) return state;
	const apps = [...state.apps, app].sort((a, b) =>
		a.createdAt.localeCompare(b.createdAt),
	);
	return { ...state, apps };
}

/** Puts a deleted message back where it was in time order (unless it already came back). */
export function restoreMessage(state: ChatState, message: Message): ChatState {
	if (state.messages.some((m) => m.id === message.id)) return state;
	return {
		...state,
		messages: [...state.messages, message].sort((a, b) =>
			a.at.localeCompare(b.at),
		),
	};
}

/**
 * Combines a fresh bootstrap with what this client is still waiting on, so a reconnect mid-send doesn't make an
 * unconfirmed message vanish. `confirmedClientIds` are the clientIds the server already has.
 */
export function mergeRefresh(
	local: ChatState,
	fresh: ChatState,
	confirmedClientIds: ReadonlySet<string>,
): ChatState {
	const freshApps = new Set(fresh.apps.map((a) => a.id));
	const pendingApps = local.apps.filter(
		(a) =>
			!freshApps.has(a.id) &&
			local.messages.some((m) => m.id === localNoteId(a.id)),
	);
	const pendingNotes = new Set(pendingApps.map((a) => localNoteId(a.id)));
	const isPendingSend = (id: string) =>
		!id.startsWith(localNoteId("")) && !confirmedClientIds.has(id);
	const pendingMessages = local.messages.filter(
		(m) => isLocalId(m.id) && (pendingNotes.has(m.id) || isPendingSend(m.id)),
	);
	const pendingTaskIds = new Set(
		pendingMessages.flatMap((m) => (m.taskId ? [m.taskId] : [])),
	);

	// A picture this device sent keeps being drawn from its own copy after a re-bootstrap too, so it never reloads.
	const localUris = new Map(
		local.messages.flatMap((m) =>
			m.localUri ? [[m.id, m.localUri] as const] : [],
		),
	);
	const freshMessages = localUris.size
		? fresh.messages.map((m) =>
				localUris.has(m.id) && !m.localUri
					? { ...m, localUri: localUris.get(m.id)! }
					: m,
			)
		: fresh.messages;
	const merged = {
		...fresh,
		messages: [...freshMessages, ...pendingMessages].sort((a, b) =>
			a.at.localeCompare(b.at),
		),
		tasks: [
			...fresh.tasks,
			...local.tasks.filter((t) => pendingTaskIds.has(t.id)),
		],
		apps: [...fresh.apps, ...pendingApps],
	};
	// A read this client made while the bootstrap was on its way stays: reads only move forward.
	const chatIds = new Set(fresh.chats.map((c) => c.id));
	return (local.reads ?? []).reduce(
		(s, read) => (chatIds.has(read.chatId) ? withRead(s, read) : s),
		merged,
	);
}

/** Shows a Dev joining or leaving a chat before the server confirms it; the inverse call rolls it back. */
export function setChatDev(
	state: ChatState,
	chatId: string,
	devId: string,
	inChat: boolean,
): ChatState {
	return {
		...state,
		chats: state.chats.map((c) => {
			if (c.id !== chatId || c.devIds.includes(devId) === inChat) return c;
			return {
				...c,
				devIds: inChat
					? [...c.devIds, devId]
					: c.devIds.filter((id) => id !== devId),
			};
		}),
	};
}

export function setChatTitle(
	state: ChatState,
	chatId: string,
	title: string,
): ChatState {
	return {
		...state,
		chats: state.chats.map((c) => (c.id === chatId ? { ...c, title } : c)),
	};
}

/** Applies (or, given the previous values, rolls back) edits to a Dev's own fields. */
export function setDevFields(
	state: ChatState,
	devId: string,
	fields: Partial<Pick<Dev, "name" | "color" | "descriptionText">>,
): ChatState {
	const dev = state.devs[devId];
	if (!dev) return state;
	return {
		...state,
		devs: { ...state.devs, [devId]: { ...dev, ...fields } },
	};
}
