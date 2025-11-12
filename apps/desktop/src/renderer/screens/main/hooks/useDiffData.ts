import { useCallback, useEffect, useState } from "react";
import type { DiffViewData } from "../components/DiffView/types";

interface UseDiffDataProps {
	workspaceId: string | undefined;
	worktreeId: string | null | undefined;
	worktreeBranch?: string;
	workspaceName?: string;
	enabled: boolean;
}

export function useDiffData({
	workspaceId,
	worktreeId,
	worktreeBranch,
	workspaceName,
	enabled,
}: UseDiffDataProps) {
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [diffData, setDiffData] = useState<DiffViewData | null>(null);
	const [error, setError] = useState<string | null>(null);

	const loadDiff = useCallback(
		async (isRefresh = false) => {
			if (!enabled || !workspaceId || !worktreeId) {
				setDiffData(null);
				setError(null);
				return;
			}

			if (isRefresh) {
				setRefreshing(true);
			} else {
				setLoading(true);
			}
			setError(null);

			try {
				const result = await window.ipcRenderer.invoke(
					"worktree-get-git-diff",
					{
						workspaceId,
						worktreeId,
					},
				);

				if (
					result &&
					typeof result === "object" &&
					"success" in result &&
					result.success &&
					"diff" in result &&
					result.diff
				) {
					// Transform the diff data to match DiffViewData format
					const diffViewData: DiffViewData = {
						title: `Changes in ${worktreeBranch || "worktree"}`,
						description: workspaceName
							? `Workspace: ${workspaceName}`
							: undefined,
						timestamp: new Date().toLocaleString(),
						files: result.diff.files,
					};
					setDiffData(diffViewData);
				} else {
					const errorMsg =
						result && typeof result === "object" && "error" in result
							? result.error
							: "Failed to load diff";
					setError(errorMsg || "Failed to load diff");
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				if (isRefresh) {
					setRefreshing(false);
				} else {
					setLoading(false);
				}
			}
		},
		[enabled, workspaceId, worktreeId, worktreeBranch, workspaceName],
	);

	const handleRefresh = useCallback(() => {
		loadDiff(true);
	}, [loadDiff]);

	useEffect(() => {
		if (enabled) {
			loadDiff(false);
		} else {
			setDiffData(null);
			setError(null);
			setLoading(false);
			setRefreshing(false);
		}
	}, [enabled, loadDiff]);

	return {
		diffData,
		loading,
		refreshing,
		error,
		refresh: handleRefresh,
	};
}

