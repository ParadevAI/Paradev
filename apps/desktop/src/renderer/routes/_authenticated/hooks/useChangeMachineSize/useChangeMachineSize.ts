import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useFormat } from "@superset/i18n/react";
import type { MachineSize } from "@superset/shared/billing";
import { toast } from "@superset/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useMachineSizeOptions } from "renderer/routes/_authenticated/hooks/useMachineSizeOptions";
import { refreshSandboxAccess } from "renderer/routes/_authenticated/providers/SandboxAccessProvider";
import { useResizingWorkspacesStore } from "renderer/routes/_authenticated/stores/resizingWorkspacesStore";

/** Not a React Query mutation: it starts from a menu that unmounts long before the restart finishes. */
export function useChangeMachineSize(workspaceId: string) {
	const { t } = useLingui();
	const { formatNumber } = useFormat();
	const { workspaces } = useCloudWorkspaces();
	const { options, defaultSize } = useMachineSizeOptions();
	const utils = cloudTrpc.useUtils();
	const queryClient = useQueryClient();
	const isResizing = useResizingWorkspacesStore((state) =>
		state.resizingIds.has(workspaceId),
	);
	const row = workspaces?.find((candidate) => candidate.id === workspaceId);
	const currentSize =
		(row?.machineSize as MachineSize | null | undefined) ?? defaultSize;

	const change = async (size: MachineSize) => {
		const store = useResizingWorkspacesStore.getState();
		if (size === currentSize || store.resizingIds.has(workspaceId)) return;
		store.markResizing(workspaceId);
		const label = options.find((option) => option.size === size)?.name ?? size;
		const toastId = toast.loading(t({ message: `Changing to ${label}…` }));
		try {
			const result = await apiTrpcClient.cloudWorkspace.setMachineSize.mutate({
				id: workspaceId,
				machineSize: size,
			});
			if (result.restarted) void refreshSandboxAccess(queryClient, workspaceId);
			if (
				result.restarted &&
				result.boxVcpus !== null &&
				result.boxVcpus !== result.vcpus
			) {
				const actual = formatNumber(result.boxVcpus);
				const wanted = formatNumber(result.vcpus);
				toast.error(
					t({
						message: `The box came back at ${actual} vCPU instead of ${wanted}. Restart it to try again.`,
					}),
					{ id: toastId },
				);
			} else if (result.restarted) {
				toast.success(t({ message: `Restarted at ${label}` }), { id: toastId });
			} else {
				toast.success(t({ message: `Starts at ${label} when it next wakes` }), {
					id: toastId,
				});
			}
		} catch (error) {
			toast.error(
				t({
					message: `Couldn't change the machine size: ${errorMessage(error)}`,
				}),
				{ id: toastId },
			);
		} finally {
			useResizingWorkspacesStore.getState().clearResizing(workspaceId);
			void utils.cloudWorkspace.list.invalidate();
		}
	};

	return {
		options,
		currentSize,
		currentOption: options.find((option) => option.size === currentSize),
		isResizing,
		isReady: row?.status === "ready",
		change,
	};
}
