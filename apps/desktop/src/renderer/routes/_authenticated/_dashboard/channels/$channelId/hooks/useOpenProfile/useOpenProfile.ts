import { useCallback } from "react";
import { useChannelPaneStore } from "../../stores/channelPaneStore";

/** Opens a person's profile as a page in the channel's side pane. */
export function useOpenProfile(channelId: string) {
	const push = useChannelPaneStore((state) => state.push);
	return useCallback(
		(person: { id: string }) =>
			push(channelId, { kind: "profile", id: person.id }),
		[channelId, push],
	);
}
