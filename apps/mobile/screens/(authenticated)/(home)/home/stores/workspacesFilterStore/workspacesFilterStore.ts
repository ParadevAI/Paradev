import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ScopeSelection } from "@/screens/(authenticated)/(home)/utils/scopeSelection";
import {
	migrateWorkspacesFilter,
	WORKSPACES_FILTER_VERSION,
} from "./migrateWorkspacesFilter";

/** Desktop sidebar's sort modes. Projects keep their order in every mode. */
export type WorkspaceSort = "manual" | "active" | "created";

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
	/** Null until the user picks places: Home then applies its default. */
	selection: ScopeSelection | null;
	sort: WorkspaceSort;
	cloudStatus: CloudStatusFilter;
	cloudCreator: CloudCreatorFilter;
	/** False until AsyncStorage has answered — the saved filter isn't here yet. */
	hasHydrated: boolean;
	setSelection: (selection: ScopeSelection) => void;
	setSort: (sort: WorkspaceSort) => void;
	setCloudStatus: (status: CloudStatusFilter) => void;
	setCloudCreator: (creator: CloudCreatorFilter) => void;
}

export const useWorkspacesFilterStore = create<WorkspacesFilterStore>()(
	persist(
		(set) => ({
			selection: null,
			sort: "manual",
			cloudStatus: "active",
			cloudCreator: "me",
			hasHydrated: false,
			setSelection: (selection) => set({ selection }),
			setSort: (sort) => set({ sort }),
			setCloudStatus: (cloudStatus) => set({ cloudStatus }),
			setCloudCreator: (cloudCreator) => set({ cloudCreator }),
		}),
		{
			name: "workspaces-filter",
			storage: createJSONStorage(() => AsyncStorage),
			version: WORKSPACES_FILTER_VERSION,
			migrate: (persisted, version) =>
				migrateWorkspacesFilter(
					persisted,
					version,
				) as unknown as WorkspacesFilterStore,
			partialize: ({ selection, sort, cloudCreator }) => ({
				selection,
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
