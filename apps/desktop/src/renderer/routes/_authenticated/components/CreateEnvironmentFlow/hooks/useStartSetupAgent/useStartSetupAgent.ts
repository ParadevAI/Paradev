import { useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useDefaultCloudAgent } from "renderer/routes/_authenticated/hooks/useDefaultCloudAgent";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { seedPendingCloudChat } from "renderer/stores/workspace-creates/pendingCloudChat";

export function useStartSetupAgent() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const collections = useCollections();
	const utils = cloudTrpc.useUtils();
	const create = cloudTrpc.cloudWorkspace.create.useMutation();
	const defaultAgent = useDefaultCloudAgent();

	const start = useCallback(
		async ({
			organizationId,
			environment,
			prompt,
			agent = defaultAgent,
		}: {
			organizationId: string;
			environment: { id: string; name: string };
			prompt: string;
			agent?: string | null;
		}) => {
			if (!agent) {
				throw new Error(
					t({ message: "No agent is available to set up the environment" }),
				);
			}
			const { initialLaunch, ...created } = await create.mutateAsync({
				organizationId,
				environmentId: environment.id,
				name: t({ message: `Set up ${environment.name}` }),
				prompt,
				agent,
				agentTerminalId: crypto.randomUUID(),
			});
			seedPendingCloudChat({
				collections,
				workspaceId: created.id,
				launch: initialLaunch,
				prompt,
			});
			// Seeded, not only invalidated: the route decides between
			// "provisioning" and "doesn't exist" off this list.
			const listInput = { organizationId };
			await utils.cloudWorkspace.list.cancel(listInput);
			utils.cloudWorkspace.list.setData(listInput, (rows) =>
				rows ? [created, ...rows] : [created],
			);
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: created.id },
			});
			void utils.cloudWorkspace.list.invalidate();
		},
		[create, defaultAgent, t, collections, utils, navigate],
	);

	return { start, isPending: create.isPending };
}
