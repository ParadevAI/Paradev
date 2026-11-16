import { useRouterState } from "@tanstack/react-router";

/** True on the rail's Chat destination. */
export function useIsChatSection(): boolean {
	return useRouterState({
		select: (state) => /^\/chats(\/|$)/.test(state.location.pathname),
	});
}
