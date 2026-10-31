import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface SetAutomationGroupInput {
	ids: string[];
	/** Shown in the toast when one automation moves. */
	name?: string;
	group: string | null;
}

/** Moves automations to a group (null ungroups), updating the list at once. */
export function useSetAutomationGroup() {
	const { t } = useLingui();
	const utils = cloudTrpc.useUtils();

	const mutation = useMutation({
		mutationFn: async ({ ids, group }: SetAutomationGroupInput) => {
			const results = await Promise.allSettled(
				ids.map((id) =>
					apiTrpcClient.automation.setGroup.mutate({ id, group }),
				),
			);
			const failed = results.find((result) => result.status === "rejected");
			if (failed) throw failed.reason;
		},
		onMutate: async ({ ids, group }) => {
			// A refetch already in flight would land after this and undo it.
			await utils.automation.list.cancel();
			const moving = new Set(ids);
			utils.automation.list.setData(undefined, (rows) =>
				rows?.map((row) => (moving.has(row.id) ? { ...row, group } : row)),
			);
			for (const id of ids) {
				utils.automation.get.setData({ id }, (row) =>
					row ? { ...row, group } : row,
				);
			}
		},
		onSuccess: (_result, { ids, name, group }) => {
			const count = ids.length;
			if (count === 1 && name) {
				toast.success(
					group
						? t({ message: `Moved "${name}" to ${group}` })
						: t({ message: `Removed "${name}" from its group` }),
				);
				return;
			}
			toast.success(
				group
					? t({
							message: plural(count, {
								one: `Moved # automation to ${group}`,
								other: `Moved # automations to ${group}`,
							}),
						})
					: t({
							message: plural(count, {
								one: "Removed # automation from its group",
								other: "Removed # automations from their groups",
							}),
						}),
			);
		},
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Failed to move automation" })),
			),
		onSettled: (_data, _error, { ids }) => {
			void utils.automation.list.invalidate();
			for (const id of ids) void utils.automation.get.invalidate({ id });
		},
	});

	return {
		setGroup: (input: SetAutomationGroupInput) => mutation.mutate(input),
		isPending: mutation.isPending,
	};
}
