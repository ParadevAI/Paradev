import type {
	App,
	ChatState,
	Message,
	OlderMessages,
	Task,
} from "@superset/chats-core";
import type { ApiMessagePage } from "../api-types/api-types.ts";
import { toApp, toMessage, toTask } from "../from-api/from-api.ts";
import { isLocalId } from "../optimistic/optimistic.ts";
import type { SyncApi } from "../sync-api/sync-api.ts";

/** Messages per page of older history. */
export const OLDER_PAGE_SIZE = 50;

const COMPLETE: OlderMessages = { hasMore: false, loading: false };

export const olderMessagesOf = (
	state: ChatState,
	chatId: string,
): OlderMessages => state.olderMessages?.[chatId] ?? COMPLETE;

function setOlderMessages(
	state: ChatState,
	chatId: string,
	older: OlderMessages,
): ChatState {
	return {
		...state,
		olderMessages: { ...state.olderMessages, [chatId]: older },
	};
}

/** The chat's oldest message the server has, which the next page goes back from (our unsent ones are the newest). */
const oldestSynced = (state: ChatState, chatId: string) =>
	state.messages.find((m) => m.chatId === chatId && !isLocalId(m.id));

/** Earlier messages first, so a time they share with loaded ones keeps the server's order. */
const byTime = (messages: Message[]) =>
	messages.sort((a, b) => a.at.localeCompare(b.at));

/**
 * Adds the apps and tasks older messages carry as cards that the state lacks (bootstrap sends saved apps and recent
 * tasks only). Those it has stay: realtime events keep them current.
 */
function withCards(state: ChatState, apps: App[], tasks: Task[]): ChatState {
	const knownApps = new Set(state.apps.map((a) => a.id));
	const knownTasks = new Set(state.tasks.map((t) => t.id));
	const newApps = apps.filter((a) => !knownApps.has(a.id));
	const newTasks = tasks.filter((t) => !knownTasks.has(t.id));
	if (newApps.length === 0 && newTasks.length === 0) return state;
	return {
		...state,
		apps: newApps.length
			? [...state.apps, ...newApps].sort((a, b) =>
					a.createdAt.localeCompare(b.createdAt),
				)
			: state.apps,
		tasks: newTasks.length ? [...state.tasks, ...newTasks] : state.tasks,
	};
}

/** The apps and tasks of `from` that `messages` carry as cards. */
function cardsOf(from: ChatState, messages: Message[]) {
	const appIds = new Set(messages.flatMap((m) => (m.appId ? [m.appId] : [])));
	const taskIds = new Set(
		messages.flatMap((m) => (m.taskId ? [m.taskId] : [])),
	);
	return {
		apps: from.apps.filter((a) => appIds.has(a.id)),
		tasks: from.tasks.filter((t) => taskIds.has(t.id)),
	};
}

/**
 * Puts a page of older messages in front of the chat's, with the apps and tasks they carry. The page counts only if
 * the chat still starts at `cursorId` (a re-bootstrap may have replaced its history meanwhile); a short page means the
 * chat's first message is here.
 */
export function withOlderPage(
	state: ChatState,
	chatId: string,
	cursorId: string,
	page: ApiMessagePage,
	limit: number,
): ChatState {
	if (oldestSynced(state, chatId)?.id !== cursorId)
		return setOlderMessages(state, chatId, {
			...olderMessagesOf(state, chatId),
			loading: false,
		});
	const known = new Set(state.messages.map((m) => m.id));
	const older = page.messages.map(toMessage).filter((m) => !known.has(m.id));
	const withPage = withCards(
		{ ...state, messages: byTime([...older, ...state.messages]) },
		page.apps.map(toApp),
		page.tasks.map(toTask),
	);
	return setOlderMessages(withPage, chatId, {
		hasMore: page.messages.length >= limit,
		loading: false,
	});
}

/**
 * A re-bootstrap brings each chat's latest messages only. Where those still join up with what this client has, the
 * older pages it loaded stay (and so does the reader's place), with the sketches and tasks their cards show; where they
 * don't (more arrived while it was away than a bootstrap holds), the gap would show, so the chat starts again from the
 * fresh messages.
 */
export function keepOlderMessages(
	local: ChatState,
	fresh: ChatState,
): ChatState {
	const inFresh = new Set(fresh.messages.map((m) => m.id));
	const batchesInFresh = new Set((fresh.triggerBatches ?? []).map((b) => b.id));
	let messages = fresh.messages;
	let olderMessages = fresh.olderMessages;
	const keptOlder: Message[] = [];
	let triggerBatches = fresh.triggerBatches;
	for (const chat of fresh.chats) {
		if (!olderMessagesOf(fresh, chat.id).hasMore) continue;
		const freshOldest = oldestSynced(fresh, chat.id);
		if (!freshOldest) continue;
		const kept = local.messages.findIndex((m) => m.id === freshOldest.id);
		if (kept < 0) continue;
		const older = local.messages
			.slice(0, kept)
			.filter((m) => m.chatId === chat.id && !inFresh.has(m.id));
		if (older.length === 0) continue;
		keptOlder.push(...older);
		messages = [...older, ...messages];
		olderMessages = {
			...olderMessages,
			[chat.id]: olderMessagesOf(local, chat.id),
		};
		// The bootstrap sends batches only from its oldest message on; the kept history keeps the ones between its own.
		const olderBatches = (local.triggerBatches ?? []).filter(
			(b) =>
				b.chatId === chat.id &&
				b.at < freshOldest.at &&
				!batchesInFresh.has(b.id),
		);
		if (olderBatches.length)
			triggerBatches = [...olderBatches, ...(triggerBatches ?? [])].sort(
				(a, b) => a.at.localeCompare(b.at),
			);
	}
	if (messages === fresh.messages) return fresh;
	const cards = cardsOf(local, keptOlder);
	return withCards(
		{
			...fresh,
			messages: byTime(messages),
			olderMessages,
			...(triggerBatches ? { triggerBatches } : {}),
		},
		cards.apps,
		cards.tasks,
	);
}

interface Deps {
	api: Pick<SyncApi, "olderMessages">;
	getState: () => ChatState | null;
	update: (change: (s: ChatState) => ChatState) => void;
}

/**
 * Pages a chat's history in from the server, one page at a time per chat. A failed page just stops the spinner: the
 * next scroll toward the top asks again.
 */
export function createMessageHistory({ api, getState, update }: Deps) {
	return {
		async loadOlderMessages(chatId: string) {
			const state = getState();
			if (
				!state ||
				olderMessagesOf(state, chatId).loading ||
				!olderMessagesOf(state, chatId).hasMore
			)
				return;
			const cursor = oldestSynced(state, chatId);
			if (!cursor) return;
			update((s) =>
				setOlderMessages(s, chatId, { hasMore: true, loading: true }),
			);
			try {
				const page = await api.olderMessages(
					chatId,
					cursor.id,
					OLDER_PAGE_SIZE,
				);
				update((s) =>
					withOlderPage(s, chatId, cursor.id, page, OLDER_PAGE_SIZE),
				);
			} catch {
				update((s) =>
					setOlderMessages(s, chatId, {
						...olderMessagesOf(s, chatId),
						loading: false,
					}),
				);
			}
		},
	};
}

export type MessageHistory = ReturnType<typeof createMessageHistory>;
