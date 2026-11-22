import type { RouterInputs } from "@superset/trpc";
import { useCallback } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	type PendingCloudLaunchContext,
	seedPendingCloudLaunch,
} from "renderer/stores/workspace-creates/pendingCloudLaunch";
import { withCreatedCloudWorkspace } from "./utils/withCreatedCloudWorkspace";

export type CreateCloudWorkspaceInput = Omit<
	RouterInputs["cloudWorkspace"]["create"],
	"agentTerminalId"
>;

export function useCreateCloudWorkspace() {
	const collections = useCollections();
	const utils = cloudTrpc.useUtils();
	const mutation = cloudTrpc.cloudWorkspace.create.useMutation();
	const { mutateAsync } = mutation;

	const create = useCallback(
		async (
			input: CreateCloudWorkspaceInput,
			launchContext: PendingCloudLaunchContext = {},
		) => {
			const { initialLaunch, ...created } = await mutateAsync(input);
			seedPendingCloudLaunch({
				collections,
				workspaceId: created.id,
				launch: initialLaunch,
				...launchContext,
			});
			// Cancelled first so a fetch from before the create can't land on top.
			const listInput = { organizationId: input.organizationId };
			await utils.cloudWorkspace.list.cancel(listInput);
			utils.cloudWorkspace.list.setData(listInput, (rows) =>
				withCreatedCloudWorkspace(rows, created),
			);
			void utils.cloudWorkspace.list.invalidate(listInput);
			return created;
		},
		[collections, mutateAsync, utils],
	);

	return { create, isPending: mutation.isPending };
}
