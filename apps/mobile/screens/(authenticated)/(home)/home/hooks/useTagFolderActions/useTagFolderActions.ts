import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
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
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
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

export interface TagFolderActions {
	/** Files the workspace under `nextTag`, or ungroups it when null. */
	moveToFolder: (
		workspace: HostWorkspaceItem,
		folderTags: readonly string[],
		nextTag: string | null,
	) => void;
	createFolder: (
		workspace: HostWorkspaceItem,
		projectId: string | null,
		folderTags: readonly string[],
	) => Promise<void>;
	renameFolder: (
		projectId: string | null,
		folder: TagFolderGroup<unknown>,
	) => Promise<void>;
	setFolderColor: (
		projectId: string | null,
		folder: TagFolderGroup<unknown>,
		color: string | null,
	) => void;
	/**
	 * Deleting a group untags every workspace in the project that carries
	 * it, then drops its settings. The workspaces stay, ungrouped.
	 */
	deleteFolder: (
		projectId: string | null,
		folder: TagFolderGroup<unknown>,
		projectWorkspaces: readonly HostWorkspaceItem[],
	) => Promise<void>;
}

function createTagFolderActions({
	host,
	cache,
	queryClient,
	i18n,
}: {
	host: WorkspacesHost;
	cache: HostWorkspacesCacheOps;
	queryClient: QueryClient;
	i18n: I18n;
}): TagFolderActions {
	const hostUrl = host.isOnline
		? hostServiceUrl(host.organizationId, host.machineId)
		: null;
	const settingsKey = hostTagFoldersQueryKey(host.machineId);

	/** The workspace as the cache holds it now, after any wait for input. */
	const latest = (workspace: HostWorkspaceItem): HostWorkspaceItem => {
		const rows = queryClient.getQueryData<HostWorkspaceRow[]>(
			getHostWorkspacesQueryKey(host.machineId),
		);
		const row = rows?.find((item) => item.id === workspace.id);
		return row ? { ...workspace, ...row } : workspace;
	};

	const writeTags = async (workspace: HostWorkspaceItem, tags: string[]) => {
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
	};

	const writeSetting = async (
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
	};

	const fail = (title: string) => () => Alert.alert(title);

	return {
		moveToFolder: (workspace, folderTags, nextTag) => {
			const current = normalizeWorkspaceTags(workspace.tags);
			const next = applyFolderTagChange(current, folderTags, nextTag);
			if (next.join("\n") === current.join("\n")) return;
			void writeTags(workspace, next).catch(
				fail(i18n._(msg({ message: "Couldn't move the workspace" }))),
			);
		},
		createFolder: async (workspace, projectId, folderTags) => {
			const name = (
				await prompt({
					title: i18n._(msg({ message: "Create new group" })),
					defaultValue: i18n._(msg({ message: "New group" })),
					confirmText: i18n._(msg({ message: "Create" })),
					selectText: true,
				})
			)?.trim();
			if (!name) return;
			const scope = tagFolderScope(projectId);
			// A setting can outlive its group; a new group must not inherit it.
			const storedTags = (
				queryClient.getQueryData<FolderSettingRow[]>(settingsKey) ?? []
			).flatMap((row) => (row.scope === scope ? [row.tag] : []));
			const tag = mintFolderTag(name, [...folderTags, ...storedTags]);
			try {
				await writeSetting(scope, tag, {
					displayName: name,
					color: randomGroupColor(),
				});
				const current = latest(workspace);
				await writeTags(
					current,
					applyFolderTagChange(
						current.tags,
						[...folderTags, ...normalizeWorkspaceTags(current.tags)],
						tag,
					),
				);
			} catch {
				Alert.alert(i18n._(msg({ message: "Couldn't create the group" })));
			}
		},
		renameFolder: async (projectId, folder) => {
			const name = (
				await prompt({
					title: i18n._(msg({ message: "Rename group" })),
					defaultValue: folder.name,
					confirmText: i18n._(msg({ message: "Rename" })),
					selectText: true,
				})
			)?.trim();
			if (!name || name === folder.name) return;
			void writeSetting(tagFolderScope(projectId), folder.tag, {
				displayName: name,
			}).catch(fail(i18n._(msg({ message: "Couldn't rename the group" }))));
		},
		setFolderColor: (projectId, folder, color) => {
			void writeSetting(tagFolderScope(projectId), folder.tag, { color }).catch(
				fail(i18n._(msg({ message: "Couldn't change the group color" }))),
			);
		},
		deleteFolder: async (projectId, folder, projectWorkspaces) => {
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
				Alert.alert(i18n._(msg({ message: "Couldn't delete the group" })));
			} finally {
				void queryClient.invalidateQueries({ queryKey: settingsKey });
			}
		},
	};
}

/**
 * Desktop's group actions on Home, resolved by the host that owns the
 * workspace or section: a folder is a workspace tag, and its name and color
 * are that host's tag-folder settings. Every write shows at once and is
 * undone by a refetch when the host refuses it.
 */
export function useTagFolderActions(
	hosts: readonly WorkspacesHost[],
	cache: HostWorkspacesCacheOps,
): (machineId: string) => TagFolderActions | null {
	const { i18n } = useLingui();
	const queryClient = useQueryClient();
	return useMemo(() => {
		const byHost = new Map(
			hosts.map((host) => [
				host.machineId,
				createTagFolderActions({ host, cache, queryClient, i18n }),
			]),
		);
		return (machineId) => byHost.get(machineId) ?? null;
	}, [hosts, cache, queryClient, i18n]);
}
