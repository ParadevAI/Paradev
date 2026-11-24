import { useRouterState } from "@tanstack/react-router";
import { isChatPathname } from "renderer/routes/_authenticated/_dashboard/stores/chatTabsStore";

/** True in the Chat section: channels, threads and Devs. */
export function useIsChatSection(): boolean {
	return useRouterState({
		select: (state) => isChatPathname(state.location.pathname),
	});
}
