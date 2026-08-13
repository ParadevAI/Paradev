import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const DEFAULT_AGENT_ID = "claude";

interface NewSessionPreferencesStore {
	/** Host agent config id (e.g. "claude", "codex") the next session launches. */
	agentId: string;
	/** "projectId:machineId" of the last used target. */
	targetKey: string | null;
	/** Draft base branch for the next session; null = default branch. */
	baseBranch: string | null;
	setAgentId: (agentId: string) => void;
	setTargetKey: (targetKey: string) => void;
	setBaseBranch: (baseBranch: string | null) => void;
}

export const useNewSessionPreferencesStore =
	create<NewSessionPreferencesStore>()(
		persist(
			(set) => ({
				agentId: DEFAULT_AGENT_ID,
				targetKey: null,
				baseBranch: null,
				setAgentId: (agentId) => set({ agentId }),
				setTargetKey: (targetKey) => set({ targetKey, baseBranch: null }),
				setBaseBranch: (baseBranch) => set({ baseBranch }),
			}),
			{
				name: "new-session-preferences",
				storage: createJSONStorage(() => AsyncStorage),
				partialize: (state) => ({
					agentId: state.agentId,
					targetKey: state.targetKey,
				}),
			},
		),
	);
