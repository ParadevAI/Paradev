import { useCallback } from "react";
import { useChannelPanelStore } from "../../stores/channelPanelStore";

/** Opens a person's profile as a tab in the channel's side panel. */
export function useOpenProfile(channelId: string) {
	const open = useChannelPanelStore((state) => state.open);
	return useCallback(
		(person: { id: string; name: string }) =>
			open(channelId, { kind: "profile", id: person.id, label: person.name }),
		[channelId, open],
	);
}
