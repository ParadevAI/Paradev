import type { ChatState } from "@superset/chats-core";
import {
	applyEvent,
	type ConnectionState,
	createChatDispatch,
	createFileSends,
	createMessageHistory,
	createReadMarker,
	createTypingReporter,
	createTypingWatch,
	createWorkspaceActions,
	EMPTY_LIVE,
	type LoadStatus,
	liveTurnsReducer,
	type SyncApi,
	type SyncSignal,
	type SyncStatus,
	startSync,
	syncStoreReducer,
} from "@superset/chats-sync";
import { CHATS_REALTIME_PATH } from "@superset/shared/chats-realtime";
import { toast } from "@superset/ui/sonner";
import {
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { createChatsApi } from "../../utils/chatsApi";

const REALTIME_URL = `${env.REALTIME_URL.replace(/^http/, "ws")}${CHATS_REALTIME_PATH}`;

/** A call the chat API does not serve yet fails as a request would, so the sync layer's own error path shows it. */
function withUnserved(api: object): SyncApi {
	return new Proxy(api, {
		get: (target, key) =>
			Reflect.get(target, key) ??
			(() =>
				Promise.reject(
					new Error(`Chats: ${String(key)} is not available yet`),
				)),
	}) as SyncApi;
}

/**
 * Chat state for one organization, kept in step with the API: one bootstrap,
 * then realtime events and the person's own actions, applied optimistically
 * and rolled back with a toast when the API refuses them.
 */
export function useChatsStore(organizationId: string) {
	const api = useMemo(
		() => createChatsApi(apiTrpcClient, organizationId),
		[organizationId],
	);
	const [state, store] = useReducer(syncStoreReducer, null);
	const [status, setStatus] = useState<LoadStatus>({ kind: "loading" });
	const [connection, setConnection] = useState<ConnectionState>("connecting");
	const [syncStatus, setSyncStatus] = useState<SyncStatus>("live");
	const stateRef = useRef(state);
	stateRef.current = state;

	const update = useCallback(
		(change: (current: ChatState) => ChatState) =>
			store({ type: "update", change }),
		[],
	);
	const listeners = useRef(new Set<(signal: SyncSignal) => void>());
	const [turns, applyToTurns] = useReducer(liveTurnsReducer, EMPTY_LIVE);
	const signal = useCallback((event: SyncSignal) => {
		applyToTurns(event);
		for (const listener of listeners.current) listener(event);
	}, []);
	const subscribe = useCallback((listener: (signal: SyncSignal) => void) => {
		listeners.current.add(listener);
		return () => {
			listeners.current.delete(listener);
		};
	}, []);

	const live = useMemo(
		() => ({
			subscribe,
			loadOlderMessages: createMessageHistory({
				api,
				getState: () => stateRef.current,
				update,
			}).loadOlderMessages,
			reads: createReadMarker({
				send: api.markRead,
				getState: () => stateRef.current,
				update,
			}),
			files: createFileSends({ api, update }),
			fileLink: api.fileLink,
			typing: {
				watch: createTypingWatch({ subscribe }),
				reporter: createTypingReporter({ send: api.reportTyping }),
			},
		}),
		[api, update, subscribe],
	);
	useEffect(() => live.reads.stop, [live]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new message in the chat on screen is read too
	useEffect(() => live.reads.changed(), [live, state?.messages]);

	const fail = useCallback((title: string, error: unknown) => {
		toast.error(title, {
			description: error instanceof Error ? error.message : undefined,
		});
	}, []);

	const session = useRef<ReturnType<typeof startSync> | null>(null);
	useEffect(() => {
		const sync = startSync({
			api,
			realtimeUrl: REALTIME_URL,
			onSnapshot: (fresh, confirmedClientIds) => {
				store({ type: "refresh", fresh, confirmedClientIds });
				setStatus({ kind: "ready" });
			},
			onLoadError: () =>
				setStatus((current) =>
					current.kind === "ready" ? current : { kind: "error", message: "" },
				),
			onEvent: (event) => update((current) => applyEvent(current, event)),
			signal,
			onConnection: setConnection,
			onStatus: setSyncStatus,
			onUnauthorized: () => setStatus({ kind: "error", message: "" }),
		});
		session.current = sync;
		const resume = () => {
			if (document.visibilityState === "visible") sync.resume();
		};
		window.addEventListener("focus", resume);
		document.addEventListener("visibilitychange", resume);
		return () => {
			window.removeEventListener("focus", resume);
			document.removeEventListener("visibilitychange", resume);
			sync.stop();
			session.current = null;
		};
	}, [api, update, signal]);

	const actions = useMemo(
		() =>
			createWorkspaceActions({
				api: withUnserved(api),
				getState: () => stateRef.current,
				update,
				fail,
				groupsChanged: () => session.current?.groupsChanged(),
				signal,
			}),
		[api, update, fail, signal],
	);

	const dispatch = useMemo(
		() =>
			createChatDispatch({
				api: withUnserved(api),
				getState: () => stateRef.current,
				update,
				fail,
				notify: (title, description) => toast(title, { description }),
			}),
		[api, update, fail],
	);

	const retry = useCallback(
		() => session.current?.refresh() ?? Promise.resolve(),
		[],
	);

	return {
		state,
		status,
		connection,
		syncStatus,
		dispatch,
		actions,
		live,
		turns,
		retry,
	};
}

export type ChatsStore = ReturnType<typeof useChatsStore>;
