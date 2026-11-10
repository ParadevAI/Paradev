import type { ChatTransport } from "@superset/chat/client";
import {
	type Query,
	type QueryClient,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { getHostEventBus } from "renderer/lib/host-event-bus";

const LIVENESS_KEY = "acp-chat-session";

function livenessKey(
	sessionId: string | null,
	hostUrl: string,
	connection: unknown,
) {
	return [LIVENESS_KEY, sessionId, hostUrl, connection];
}

function isOpenCheckOn(hostUrl: string) {
	return (query: Query) =>
		query.queryKey[0] === LIVENESS_KEY &&
		query.queryKey[2] === hostUrl &&
		query.getObserversCount() > 0;
}

export function useChatSessionChecksFailing(hostUrl: string): {
	failing: boolean;
	retry: () => void;
} {
	const queryClient = useQueryClient();
	const cache = queryClient.getQueryCache();
	const failing = useSyncExternalStore(
		useCallback((onChange) => cache.subscribe(onChange), [cache]),
		() =>
			cache
				.findAll({ predicate: isOpenCheckOn(hostUrl) })
				.some((query) => query.state.status === "error"),
	);
	const retry = useCallback(
		() =>
			void queryClient.refetchQueries({ predicate: isOpenCheckOn(hostUrl) }),
		[queryClient, hostUrl],
	);
	return { failing, retry };
}

export function markChatSessionLive(
	queryClient: QueryClient,
	hostUrl: string,
	sessionId: string,
): void {
	const connection = getHostEventBus(hostUrl).getConnectionStatus();
	if (connection.state !== "open") return;
	queryClient.setQueryData(livenessKey(sessionId, hostUrl, connection), {
		live: true,
		session: null,
		cursor: null,
	});
}

export function useChatSessionLiveness({
	hostUrl,
	sessionId,
	transport,
}: {
	hostUrl: string;
	sessionId: string | null;
	transport: Pick<ChatTransport, "getSession">;
}) {
	const bus = useMemo(() => getHostEventBus(hostUrl), [hostUrl]);
	useEffect(() => bus.retain(), [bus]);
	const connection = useSyncExternalStore(
		useCallback((onChange) => bus.subscribeConnectionStatus(onChange), [bus]),
		() => bus.getConnectionStatus(),
	);
	const query = useQuery({
		enabled: sessionId !== null && connection.state === "open",
		queryKey: livenessKey(sessionId, hostUrl, connection),
		networkMode: "always",
		queryFn: () =>
			sessionId ? transport.getSession({ sessionId }) : Promise.resolve(null),
		staleTime: 5_000,
		refetchOnMount: "always",
		refetchInterval: (query) =>
			query.state.status === "error" ? 2_000 : false,
		refetchIntervalInBackground: true,
	});

	const checking =
		sessionId !== null && (connection.state !== "open" || !query.isSuccess);
	return { stored: checking ? undefined : query.data, checking };
}
