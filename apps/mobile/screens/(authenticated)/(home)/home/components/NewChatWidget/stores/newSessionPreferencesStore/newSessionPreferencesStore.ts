import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const DEFAULT_AGENT_ID = "claude";

interface NewSessionPreferencesStore {
	/** Preset (e.g. "claude", "codex") the next session launches; resolves on any host. */
	agentId: string;
	/** Row picked per machine id: two rows can share a preset, and row ids exist on one host only. */
	agentConfigIdByHost: Record<string, string>;
	/** "projectId:machineId" of the last used target. */
	targetKey: string | null;
	/** Draft base branch for the next session; null = default branch. */
	baseBranch: string | null;
	/** Cloud only. Null until picked; create falls back to the first. */
	environmentId: string | null;
	/**
	 * Last-picked model and effort per launch preset ("claude", "codex", …).
	 * No entry means the agent's own default: nothing is sent at launch. Keyed
	 * by preset rather than host config id so a pick survives host switches,
	 * same as the desktop's per-preset maps.
	 */
	modelByAgent: Record<string, string>;
	effortByAgent: Record<string, string>;
	/** False until AsyncStorage has answered — the saved picks aren't here yet. */
	hasHydrated: boolean;
	setAgentId: (
		agentId: string,
		hostPick?: { machineId: string; configId: string },
	) => void;
	setTargetKey: (targetKey: string) => void;
	setBaseBranch: (baseBranch: string | null) => void;
	setEnvironmentId: (environmentId: string) => void;
	/** Null clears the pick back to the agent default. */
	setModel: (presetId: string, model: string | null) => void;
	setEffort: (presetId: string, effort: string | null) => void;
}

function withPick(
	picks: Record<string, string>,
	presetId: string,
	pick: string | null,
): Record<string, string> {
	const rest = Object.fromEntries(
		Object.entries(picks).filter(([key]) => key !== presetId),
	);
	return pick ? { ...rest, [presetId]: pick } : rest;
}

export const useNewSessionPreferencesStore =
	create<NewSessionPreferencesStore>()(
		persist(
			(set) => ({
				agentId: DEFAULT_AGENT_ID,
				agentConfigIdByHost: {},
				targetKey: null,
				baseBranch: null,
				environmentId: null,
				modelByAgent: {},
				effortByAgent: {},
				hasHydrated: false,
				setAgentId: (agentId, hostPick) =>
					set((state) => ({
						agentId,
						agentConfigIdByHost: hostPick
							? {
									...state.agentConfigIdByHost,
									[hostPick.machineId]: hostPick.configId,
								}
							: state.agentConfigIdByHost,
					})),
				setTargetKey: (targetKey) => set({ targetKey, baseBranch: null }),
				setBaseBranch: (baseBranch) => set({ baseBranch }),
				// A picked branch belongs to the repository it was listed from.
				setEnvironmentId: (environmentId) =>
					set({ environmentId, baseBranch: null }),
				setModel: (presetId, model) =>
					set((state) => ({
						modelByAgent: withPick(state.modelByAgent, presetId, model),
					})),
				setEffort: (presetId, effort) =>
					set((state) => ({
						effortByAgent: withPick(state.effortByAgent, presetId, effort),
					})),
			}),
			{
				name: "new-session-preferences",
				storage: createJSONStorage(() => AsyncStorage),
				partialize: (state) => ({
					agentId: state.agentId,
					agentConfigIdByHost: state.agentConfigIdByHost,
					targetKey: state.targetKey,
					environmentId: state.environmentId,
					modelByAgent: state.modelByAgent,
					effortByAgent: state.effortByAgent,
				}),
				// Same async-rehydration window as the filter store: until this
				// flips, the composer would fall back to a default target instead
				// of the last used one.
				onRehydrateStorage: () => () =>
					useNewSessionPreferencesStore.setState({ hasHydrated: true }),
			},
		),
	);
