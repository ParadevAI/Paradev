import { prompt } from "@superset/alert-prompt";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Alert, Share } from "react-native";
import type {
	HostWorkspaceItem,
	HostWorkspacesCacheOps,
} from "@/hooks/useHostWorkspaces";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { isTrpcErrorWithData } from "@/lib/host-service/errors";
import { workspaceShareUrl } from "@/lib/web-links";

interface DestroyOptions {
	/** Git-destructive consent only: skips the dirty-worktree preflight. */
	force: boolean;
	/** Consent to abandon the teardown script — set once it has already failed. */
	skipTeardown: boolean;
}

export function useWorkspaceRowActions(
	workspace: HostWorkspaceItem,
	cache: HostWorkspacesCacheOps,
) {
	const [isDeleting, setIsDeleting] = useState(false);

	const renameWorkspace = async () => {
		const hostUrl = cache.resolveHostUrl(workspace.hostId);
		if (!hostUrl) {
			Alert.alert("Host is not online");
			return;
		}
		const name = await prompt({
			title: "Rename workspace",
			defaultValue: workspace.name,
			confirmText: "Rename",
			selectText: true,
		});
		const trimmed = name?.trim();
		if (!trimmed || trimmed === workspace.name) return;
		try {
			await getHostServiceClientByUrl(hostUrl).workspace.update.mutate({
				id: workspace.id,
				name: trimmed,
			});
		} catch {
			Alert.alert("Rename failed");
		}
		cache.invalidateHost(workspace.hostId);
	};

	const destroyWorkspace = async ({ force, skipTeardown }: DestroyOptions) => {
		const hostUrl = cache.resolveHostUrl(workspace.hostId);
		if (!hostUrl) {
			Alert.alert("Host is not online");
			return;
		}
		setIsDeleting(true);
		try {
			await getHostServiceClientByUrl(hostUrl).workspaceCleanup.destroy.mutate({
				workspaceId: workspace.id,
				deleteBranch: false,
				force,
				skipTeardown,
			});
			cache.removeWorkspace(workspace.hostId, workspace.id);
		} catch (error) {
			if (isTrpcErrorWithData(error)) {
				if (error.data.deleteInProgress) {
					Alert.alert("Delete already in progress");
					return;
				}
				// A failing teardown script shouldn't hold the delete hostage on a
				// phone: it already ran, so let the workspace go without it.
				if (error.data.teardownFailure && !skipTeardown) {
					await destroyWorkspace({ force: true, skipTeardown: true });
					return;
				}
				if (error.data.code === "CONFLICT") {
					Alert.alert("Worktree has uncommitted changes", undefined, [
						{ style: "cancel", text: "Cancel" },
						{
							onPress: () =>
								void destroyWorkspace({ force: true, skipTeardown }),
							style: "destructive",
							text: "Delete anyway",
						},
					]);
					return;
				}
			}
			// The host archives the row before any slow work, so if it is gone
			// from a fresh list the delete committed and only the relay gave up
			// waiting (its 30s cap is shorter than a teardown script's).
			const rows = await cache.refetchHost(workspace.hostId);
			if (rows && !rows.some((row) => row.id === workspace.id)) return;
			Alert.alert(
				"Delete failed",
				error instanceof Error ? error.message : undefined,
			);
		} finally {
			setIsDeleting(false);
		}
	};

	const deleteWorkspace = () => {
		if (isDeleting) return;
		if (!cache.resolveHostUrl(workspace.hostId)) {
			Alert.alert("Host is not online");
			return;
		}
		Alert.alert(
			"Delete workspace",
			`Delete "${workspace.name}"? This removes its worktree from the host.`,
			[
				{ style: "cancel", text: "Cancel" },
				{
					onPress: () =>
						void destroyWorkspace({ force: false, skipTeardown: false }),
					style: "destructive",
					text: "Delete",
				},
			],
		);
	};

	const copyId = () => void Clipboard.setStringAsync(workspace.id);

	const shareWorkspace = () =>
		void Share.share({ url: workspaceShareUrl(workspace.id) });

	return {
		isDeleting,
		renameWorkspace,
		deleteWorkspace,
		copyId,
		shareWorkspace,
	};
}
