import type { OrgPresenceStatus } from "@superset/shared/org-presence";
import { create } from "zustand";

interface OrgPresenceState {
	/** Everyone with a window open in the active organization. */
	users: Record<string, OrgPresenceStatus>;
	setUsers: (users: Record<string, OrgPresenceStatus>) => void;
}

export const useOrgPresenceStore = create<OrgPresenceState>()((set) => ({
	users: {},
	setUsers: (users) => set({ users }),
}));

export function useUserPresence(userId: string): OrgPresenceStatus | "offline" {
	return useOrgPresenceStore((state) => state.users[userId] ?? "offline");
}
