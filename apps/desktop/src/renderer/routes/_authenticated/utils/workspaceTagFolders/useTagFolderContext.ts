import { useMemo } from "react";
import { mergeHostTagFoldersWithLegacy } from "renderer/hooks/host-projects/useHostTagFolders";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useHostProjects } from "renderer/routes/_authenticated/providers/HostProjectsProvider";
import { useHostTagFolders } from "renderer/routes/_authenticated/providers/HostTagFoldersProvider";
import type { TagFolderContext } from "./workspaceTagFolders";

/**
 * The one presentation context every membership pass shares: host-side tag
 * settings (from the tag-folder fan-out) and the local hidden-folder list.
 * Build it here, not per consumer — two passes with different contexts is
 * the same bug class as two membership derivations.
 */
export function useTagFolderContext(): TagFolderContext {
	const { hostResults: tagFolderHostResults } = useHostTagFolders();
	const { hostResults: projectHostResults } = useHostProjects();
	const { preferences } = useV2UserPreferences();
	const hiddenTagFolders = preferences.hiddenTagFolders;
	return useMemo(
		() => ({
			tagSettings: mergeHostTagFoldersWithLegacy(
				tagFolderHostResults,
				projectHostResults,
			).map(({ scope, ...setting }) => ({
				projectId: scope,
				...setting,
			})),
			hiddenTagsByProject: new Map(
				Object.entries(hiddenTagFolders).map(([projectId, tags]) => [
					projectId,
					new Set(tags),
				]),
			),
		}),
		[tagFolderHostResults, projectHostResults, hiddenTagFolders],
	);
}
