import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useRef } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useMatchRoute } from "renderer/hooks/useMatchRoute";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useChatsStore } from "../../hooks/useChatsStore";
import { useChatsBridge } from "../../stores/chatsBridge";
import { chatNotification } from "../../utils/chatNotification";

function ChatsStoreMount({ organizationId }: { organizationId: string }) {
	const store = useChatsStore(organizationId);
	const setStore = useChatsBridge((state) => state.setStore);
	useEffect(() => {
		setStore(store);
	}, [store, setStore]);
	useEffect(() => () => setStore(null), [setStore]);

	const matchRoute = useMatchRoute();
	const viewed = matchRoute({ to: "/chats/$chatId", fuzzy: true });
	const viewedId = useRef<string | null>(null);
	viewedId.current = viewed ? viewed.chatId : null;
	const state = useRef(store.state);
	state.current = store.state;
	const subscribe = store.live.subscribe;
	useEffect(
		() =>
			subscribe((signal) => {
				if (signal.type !== "event") return;
				if (signal.event.type !== "message.created") return;
				const { message } = signal.event;
				if (message.groupId === viewedId.current && document.hasFocus()) return;
				const current = state.current;
				const content = current ? chatNotification(current, message) : null;
				if (!content) return;
				void electronTrpcClient.notifications.showNative
					.mutate(content)
					.catch((error: unknown) =>
						console.warn("[chats] notification failed:", error),
					);
			}),
		[subscribe],
	);
	return null;
}

/** Runs the chat store for the active organization while chats are switched on. */
export function ChatsStoreBridge() {
	const enabled = useFeatureFlagEnabled(FEATURE_FLAGS.CHANNELS) === true;
	const organizationId = useActiveOrganizationId();
	if (!enabled || !organizationId) return null;
	return (
		<ChatsStoreMount key={organizationId} organizationId={organizationId} />
	);
}
