import type { DiffFileSource } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type V2ChangesSectionKey = DiffFileSource["kind"];

interface V2ChangesSectionsState {
	collapsed: Partial<Record<V2ChangesSectionKey, boolean>>;
	/** Per repository of a multi-repo workspace, keyed by `repositoryCollapseKey`. Not persisted. */
	repositoryCollapsed: Record<string, boolean>;
	setCollapsed: (key: V2ChangesSectionKey, collapsed: boolean) => void;
	setRepositoryCollapsed: (
		repositoryId: string,
		key: V2ChangesSectionKey,
		collapsed: boolean,
	) => void;
}

export function repositoryCollapseKey(
	repositoryId: string,
	key: V2ChangesSectionKey,
): string {
	return `${repositoryId}:${key}`;
}

export const useV2ChangesSectionsStore = create<V2ChangesSectionsState>()(
	devtools(
		persist(
			(set) => ({
				collapsed: {},
				repositoryCollapsed: {},
				setCollapsed: (key, collapsed) =>
					set((state) => ({
						collapsed: { ...state.collapsed, [key]: collapsed },
					})),
				setRepositoryCollapsed: (repositoryId, key, collapsed) =>
					set((state) => ({
						repositoryCollapsed: {
							...state.repositoryCollapsed,
							[repositoryCollapseKey(repositoryId, key)]: collapsed,
						},
					})),
			}),
			{
				name: "v2-changes-sections-v1",
				partialize: (state) => ({ collapsed: state.collapsed }),
			},
		),
		{ name: "V2ChangesSections" },
	),
);
