import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useChatNotifications } from "../../hooks/useChatNotifications";
import { useChatsStore } from "../../hooks/useChatsStore";
import { useChatsBridge } from "../../stores/chatsBridge";

function ChatsStoreMount({ organizationId }: { organizationId: string }) {
	const store = useChatsStore(organizationId);
	const setStore = useChatsBridge((state) => state.setStore);
	useEffect(() => {
		setStore(store);
	}, [store, setStore]);
	useEffect(() => () => setStore(null), [setStore]);

	useChatNotifications(store);
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
