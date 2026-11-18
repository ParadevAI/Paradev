import { useLingui } from "@lingui/react/macro";
import { prompt } from "@superset/alert-prompt";
import { PROJECT_COLOR_SWATCHES } from "@superset/shared/project-colors";
import {
	applyFolderTagChange,
	mintFolderTag,
	type TagFolderSettingInput,
} from "@superset/shared/workspace-tag-folders";
import {
	normalizeWorkspaceTags,
	tagFolderScope,
} from "@superset/shared/workspace-tags";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { Alert } from "react-native";
import {
	getHostWorkspacesQueryKey,
	type HostWorkspaceItem,
	type HostWorkspacesCacheOps,
	type WorkspacesHost,
} from "@/hooks/useHostWorkspaces";
import {
	getHostServiceClientByUrl,
	type HostWorkspaceRow,
	hostServiceUrl,
} from "@/lib/host-service/client";
import type { TagFolderGroup } from "../../utils/groupByTagFolder";
import { hostTagFoldersQueryKey } from "../useHostTagFolders";

type FolderSettingRow = Omit<TagFolderSettingInput, "projectId"> & {
	scope: string;
};

const WORKSPACE_LISTS = ["host-service", "workspaces", "list"] as const;

const randomGroupColor = () =>
	PROJECT_COLOR_SWATCHES[
		Math.floor(Math.random() * PROJECT_COLOR_SWATCHES.length)
	]?.value ?? null;

/**
 * Desktop's group actions for one host's Home: a folder is a workspace tag,
 * and its name and color are the host's tag-folder settings. Every write
 * shows at once and is undone by a refetch when the host refuses it.
 */
export function useTagFolderActions(
	host: WorkspacesHost | null,
	cache: HostWorkspacesCacheOps,
) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const hostUrl = host
		? hostServiceUrl(host.organizationId, host.machineId)
		: null;
	const settingsKey = useMemo(
		() => hostTagFoldersQueryKey(host?.machineId, hostUrl),
		[host?.machineId, hostUrl],
	);

	/** The workspace as the cache holds it now, after any wait for input. */
	const latest = useCallback(
		(workspace: HostWorkspaceItem): HostWorkspaceItem => {
			const rows = queryClient.getQueryData<HostWorkspaceRow[]>(
				getHostWorkspacesQueryKey(host?.machineId ?? null, hostUrl),
			);
			const row = rows?.find((item) => item.id === workspace.id);
			return row ? { ...workspace, ...row } : workspace;
		},
		[queryClient, host?.machineId, hostUrl],
	);

	const writeTags = useCallback(
		async (workspace: HostWorkspaceItem, tags: string[]) => {
			if (!hostUrl) throw new Error("host offline");
			await queryClient.cancelQueries({ queryKey: WORKSPACE_LISTS });
			const { hostReachable: _reachable, ...row } = workspace;
			cache.upsertWorkspace({ ...row, tags });
			try {
				await getHostServiceClientByUrl(hostUrl).workspace.update.mutate({
					id: workspace.id,
					tags,
				});
			} finally {
				cache.invalidateHost(workspace.hostId);
			}
		},
		[hostUrl, queryClient, cache],
	);

	const writeSetting = useCallback(
		async (
			scope: string,
			tag: string,
			patch: { displayName?: string | null; color?: string | null },
		) => {
			if (!hostUrl) throw new Error("host offline");
			await queryClient.cancelQueries({ queryKey: settingsKey });
			const isTarget = (row: FolderSettingRow) =>
				row.scope === scope && row.tag === tag;
			const before = queryClient
				.getQueryData<FolderSettingRow[]>(settingsKey)
				?.find(isTarget);
			const written: FolderSettingRow = { scope, tag, ...before, ...patch };
			queryClient.setQueryData<FolderSettingRow[]>(settingsKey, (rows = []) =>
				rows.some(isTarget)
					? rows.map((row) => (isTarget(row) ? written : row))
					: [...rows, written],
			);
			try {
				await getHostServiceClientByUrl(hostUrl).tagFolders.upsert.mutate({
					scope,
					tag,
					...patch,
				});
			} catch (error) {
				// Undo only this write: a newer edit has replaced `written`.
				queryClient.setQueryData<FolderSettingRow[]>(settingsKey, (rows = []) =>
					rows.flatMap((row) => {
						if (row !== written) return [row];
						return before ? [before] : [];
					}),
				);
				throw error;
			} finally {
				void queryClient.invalidateQueries({ queryKey: settingsKey });
			}
		},
		[hostUrl, queryClient, settingsKey],
	);

	const fail = useCallback((title: string) => () => Alert.alert(title), []);

	/** Files the workspace under `nextTag`, or ungroups it when null. */
	const moveToFolder = useCallback(
		(
			workspace: HostWorkspaceItem,
			folderTags: readonly string[],
			nextTag: string | null,
		) => {
			const current = normalizeWorkspaceTags(workspace.tags);
			const next = applyFolderTagChange(current, folderTags, nextTag);
			if (next.join("\n") === current.join("\n")) return;
			void writeTags(workspace, next).catch(
				fail(t({ message: "Couldn't move the workspace" })),
			);
		},
		[writeTags, fail, t],
	);

	const createFolder = useCallback(
		async (
			workspace: HostWorkspaceItem,
			projectId: string | null,
			folderTags: readonly string[],
		) => {
			const name = (
				await prompt({
					title: t({ message: "Create new group" }),
					defaultValue: t({ message: "New group" }),
					confirmText: t({ message: "Create" }),
					selectText: true,
				})
			)?.trim();
			if (!name) return;
			const tag = mintFolderTag(name, folderTags);
			try {
				await writeSetting(tagFolderScope(projectId), tag, {
					displayName: name,
					color: randomGroupColor(),
				});
				const current = latest(workspace);
				await writeTags(
					current,
					applyFolderTagChange(current.tags, folderTags, tag),
				);
			} catch {
				Alert.alert(t({ message: "Couldn't create the group" }));
			}
		},
		[writeSetting, writeTags, latest, t],
	);

	const renameFolder = useCallback(
		async (projectId: string | null, folder: TagFolderGroup<unknown>) => {
			const name = (
				await prompt({
					title: t({ message: "Rename group" }),
					defaultValue: folder.name,
					confirmText: t({ message: "Rename" }),
					selectText: true,
				})
			)?.trim();
			if (!name || name === folder.name) return;
			void writeSetting(tagFolderScope(projectId), folder.tag, {
				displayName: name,
			}).catch(fail(t({ message: "Couldn't rename the group" })));
		},
		[writeSetting, fail, t],
	);

	const setFolderColor = useCallback(
		(
			projectId: string | null,
			folder: TagFolderGroup<unknown>,
			color: string | null,
		) => {
			void writeSetting(tagFolderScope(projectId), folder.tag, { color }).catch(
				fail(t({ message: "Couldn't change the group color" })),
			);
		},
		[writeSetting, fail, t],
	);

	/**
	 * Deleting a group untags every workspace in the project that carries
	 * it, then drops its settings. The workspaces stay, ungrouped.
	 */
	const deleteFolder = useCallback(
		async (
			projectId: string | null,
			folder: TagFolderGroup<unknown>,
			projectWorkspaces: readonly HostWorkspaceItem[],
		) => {
			if (!hostUrl) return;
			try {
				await Promise.all(
					projectWorkspaces.flatMap((workspace) => {
						const tags = normalizeWorkspaceTags(workspace.tags);
						return tags.includes(folder.tag)
							? [
									writeTags(
										workspace,
										tags.filter((tag) => tag !== folder.tag),
									),
								]
							: [];
					}),
				);
				await getHostServiceClientByUrl(hostUrl).tagFolders.delete.mutate({
					scope: tagFolderScope(projectId),
					tag: folder.tag,
				});
			} catch {
				Alert.alert(t({ message: "Couldn't delete the group" }));
			} finally {
				void queryClient.invalidateQueries({ queryKey: settingsKey });
			}
		},
		[hostUrl, writeTags, queryClient, settingsKey, t],
	);

	return useMemo(
		() => ({
			moveToFolder,
			createFolder,
			renameFolder,
			setFolderColor,
			deleteFolder,
		}),
		[moveToFolder, createFolder, renameFolder, setFolderColor, deleteFolder],
	);
}
