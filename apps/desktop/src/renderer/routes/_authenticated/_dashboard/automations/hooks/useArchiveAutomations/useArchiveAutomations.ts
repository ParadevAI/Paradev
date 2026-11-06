import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface ArchiveTarget {
	id: string;
	name: string;
	/** Archiving pauses; restoring resumes the ones that were running. */
	enabled: boolean;
}

async function settleAll(
	targets: ArchiveTarget[],
	call: (id: string) => Promise<unknown>,
) {
	const results = await Promise.allSettled(targets.map(({ id }) => call(id)));
	const failed = results.find((result) => result.status === "rejected");
	if (failed) throw failed.reason;
}

/** Archives automations with an Undo toast, restores them, and deletes archived ones for good. */
export function useArchiveAutomations() {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();

	const refresh = (targets: ArchiveTarget[]) => {
		void utils.automation.list.invalidate();
		void utils.automation.orgRunStats.invalidate();
		for (const { id } of targets) void utils.automation.get.invalidate({ id });
	};

	const restoreMutation = useMutation({
		mutationFn: async (targets: ArchiveTarget[]) => {
			await settleAll(targets, (id) =>
				apiTrpcClient.automation.unarchive.mutate({ id }),
			);
			await settleAll(
				targets.filter((target) => target.enabled),
				(id) =>
					apiTrpcClient.automation.setEnabled.mutate({ id, enabled: true }),
			);
		},
		onSuccess: (_, targets) => {
			const [only] = targets;
			const paused = targets.some((target) => !target.enabled);
			if (targets.length === 1 && only) {
				toast.success(
					paused
						? t({ message: `Restored "${only.name}". It is paused.` })
						: t({ message: `Restored "${only.name}"` }),
				);
				return;
			}
			toast.success(
				paused
					? t({
							message: plural(targets.length, {
								one: "Restored # automation. Paused ones stay paused.",
								other: "Restored # automations. Paused ones stay paused.",
							}),
						})
					: t({
							message: plural(targets.length, {
								one: "Restored # automation",
								other: "Restored # automations",
							}),
						}),
			);
		},
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Failed to restore automation" })),
			),
		onSettled: (_data, _error, targets) => refresh(targets),
	});

	const archiveMutation = useMutation({
		mutationFn: (targets: ArchiveTarget[]) =>
			settleAll(targets, (id) =>
				apiTrpcClient.automation.archive.mutate({ id }),
			),
		onSuccess: (_, targets) => {
			const [only] = targets;
			toast(
				targets.length === 1 && only
					? t({ message: `Archived "${only.name}"` })
					: t({
							message: plural(targets.length, {
								one: "Archived # automation",
								other: "Archived # automations",
							}),
						}),
				{
					action: {
						label: t({ message: "Undo" }),
						onClick: () => restoreMutation.mutate(targets),
					},
				},
			);
		},
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Failed to archive automation" })),
			),
		onSettled: (_data, _error, targets) => refresh(targets),
	});

	const deleteMutation = useMutation({
		mutationFn: (targets: ArchiveTarget[]) =>
			settleAll(targets, (id) =>
				apiTrpcClient.automation.deleteArchived.mutate({ id }),
			),
		onSuccess: (_, targets) => {
			const [only] = targets;
			toast.success(
				targets.length === 1 && only
					? t({ message: `Deleted "${only.name}"` })
					: t({
							message: plural(targets.length, {
								one: "Deleted # automation",
								other: "Deleted # automations",
							}),
						}),
			);
		},
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Failed to delete automation" })),
			),
		onSettled: () => {
			void utils.automation.list.invalidate();
			void utils.automation.orgRunStats.invalidate();
		},
	});

	const confirmDelete = (
		targets: ArchiveTarget[],
		options?: { onDeleted?: () => void },
	) => {
		const [only] = targets;
		alert({
			title:
				targets.length === 1 && only
					? t({ message: `Delete "${only.name}" permanently?` })
					: t({
							message: plural(targets.length, {
								one: "Delete # automation permanently?",
								other: "Delete # automations permanently?",
							}),
						}),
			description: t({
				message:
					"The automation and its run history are removed. This can't be undone.",
			}),
			actions: [
				{
					label: t({ message: "Cancel" }),
					variant: "outline",
					onClick: () => {},
				},
				{
					label: t({ message: "Delete permanently" }),
					variant: "destructive",
					onClick: () =>
						deleteMutation.mutate(targets, {
							onSuccess: () => options?.onDeleted?.(),
						}),
				},
			],
		});
	};

	return {
		archive: archiveMutation.mutate,
		confirmDelete,
		archiveAsync: archiveMutation.mutateAsync,
		restore: restoreMutation.mutate,
		isPending:
			archiveMutation.isPending ||
			restoreMutation.isPending ||
			deleteMutation.isPending,
	};
}
