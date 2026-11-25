import { useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useCreateCloudWorkspace } from "renderer/routes/_authenticated/hooks/useCreateCloudWorkspace";
import { useDefaultCloudAgent } from "renderer/routes/_authenticated/hooks/useDefaultCloudAgent";

export function useStartSetupAgent() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { create, isPending } = useCreateCloudWorkspace();
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
			const created = await create(
				{
					organizationId,
					environmentId: environment.id,
					name: t({ message: `Set up ${environment.name}` }),
					prompt,
					agent,
				},
				{ prompt },
			);
			void navigate({
				to: "/workspace/$workspaceId",
				params: { workspaceId: created.id },
			});
		},
		[create, defaultAgent, t, navigate],
	);

	return { start, isPending };
}
