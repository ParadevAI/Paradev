import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Desktop sidebar's sort modes. Projects keep their order in every mode. */
export type WorkspaceSort = "manual" | "active" | "created";

/** Cloud is a place you scope to, not a machine you own. */
export type WorkspaceScope = "cloud" | "host";

export type CloudStatusFilter = "active" | "archived";

export type CloudCreatorFilter =
	| "me"
	| "anyone"
	| { userId: string; name: string; image: string | null };

export const SORT_OPTIONS: {
	value: WorkspaceSort;
	label: MessageDescriptor;
}[] = [
	{
		label: msg({ message: "Manual order" }),
		value: "manual",
	},
	{
		label: msg({ message: "Last active" }),
		value: "active",
	},
	{
		label: msg({ message: "Date created" }),
		value: "created",
	},
];

interface WorkspacesFilterStore {
	hostFilter: string | null;
	scope: WorkspaceScope;
	sort: WorkspaceSort;
	cloudStatus: CloudStatusFilter;
	cloudCreator: CloudCreatorFilter;
	/** False until AsyncStorage has answered — the saved filter isn't here yet. */
	hasHydrated: boolean;
	setHostFilter: (machineId: string | null) => void;
	setScopeCloud: () => void;
	setSort: (sort: WorkspaceSort) => void;
	setCloudStatus: (status: CloudStatusFilter) => void;
	setCloudCreator: (creator: CloudCreatorFilter) => void;
}

export const useWorkspacesFilterStore = create<WorkspacesFilterStore>()(
	persist(
		(set) => ({
			hostFilter: null,
			scope: "host",
			sort: "manual",
			cloudStatus: "active",
			cloudCreator: "me",
			hasHydrated: false,
			// Picking a machine is also how you leave Cloud; the machine is
			// remembered either way so Cloud → machine returns you where you were.
			setHostFilter: (machineId) =>
				set({ hostFilter: machineId, scope: "host" }),
			setScopeCloud: () => set({ scope: "cloud" }),
			setSort: (sort) => set({ sort }),
			setCloudStatus: (cloudStatus) => set({ cloudStatus }),
			setCloudCreator: (cloudCreator) => set({ cloudCreator }),
		}),
		{
			name: "workspaces-filter",
			storage: createJSONStorage(() => AsyncStorage),
			// Version 0 stored "updatedAt" as its default, so it cannot tell a
			// choice from the default; it maps to desktop's default instead.
			version: 1,
			migrate: (persisted, version) => {
				const state = persisted as Partial<
					Omit<WorkspacesFilterStore, "sort"> & { sort: string }
				>;
				if (version >= 1) return state as WorkspacesFilterStore;
				return {
					...state,
					sort: state.sort === "createdAt" ? "created" : "manual",
				} as WorkspacesFilterStore;
			},
			partialize: ({ hostFilter, scope, sort, cloudCreator }) => ({
				hostFilter,
				scope,
				sort,
				cloudCreator,
			}),
			// Rehydration is async — measured at ~165ms on a cold start — so
			// readers see the defaults first and the home screen would spend that
			// window showing (and fetching) the wrong host's default project.
			// Consumers wait on this flag instead. It flips on storage errors too,
			// so a failed read falls back to the defaults rather than hanging.
			onRehydrateStorage: () => () =>
				useWorkspacesFilterStore.setState({ hasHydrated: true }),
		},
	),
);
