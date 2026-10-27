import { useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	matchAgentChoice,
	portableAgentValue,
} from "renderer/routes/_authenticated/_dashboard/automations/utils/agentIdentity";
import { AGENT_STORAGE_KEY } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

const DEFAULT_TIMEZONE =
	Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export type AutomationDraft = {
	name?: string;
	prompt: string;
	/** An agent instance id, preset id, or icon id; the last-used agent when absent. */
	agent?: string;
	projectId?: string | null;
	rrule?: string;
};

/**
 * Writes an automation with no triggers (or the draft's schedule) and opens
 * its detail page, which is the editor. Automations are Pro, so this goes
 * through the paywall.
 */
export function useCreateAutomation(): {
	/** Resolves true when the automation was created. */
	create: (draft: AutomationDraft) => Promise<boolean>;
	isPending: boolean;
} {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const { machineId, activeHostUrl } = useLocalHostService();
	const { agents: agentChoices } = useV2AgentChoices(activeHostUrl);
	const { runGatedFeature } = usePaywall();

	const { mutateAsync, isPending } = useMutation({
		mutationFn: (draft: AutomationDraft) => {
			const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
			const choice =
				(draft.agent
					? (matchAgentChoice(agentChoices, draft.agent) ??
						agentChoices.find((option) => option.iconId === draft.agent))
					: null) ??
				(stored ? matchAgentChoice(agentChoices, stored) : null) ??
				agentChoices[0];
			if (!choice) throw new Error("No agent available yet");
			return apiTrpcClient.automation.create.mutate({
				name: draft.name ?? t({ message: "Untitled" }),
				prompt: draft.prompt,
				// Preset slug when unambiguous — instance UUIDs die when the host's
				// agent-config table is re-seeded, orphaning the automation.
				agent: portableAgentValue(agentChoices, choice),
				targetHostId: machineId ?? null,
				v2ProjectId: draft.projectId ?? null,
				...(draft.rrule
					? { rrule: draft.rrule, timezone: DEFAULT_TIMEZONE }
					: { triggers: [] }),
			});
		},
		onSuccess: (result) => {
			void utils.automation.list.invalidate();
			void navigate({
				to: "/automations/$automationId",
				params: { automationId: result.id },
			});
		},
		onError: (error) => {
			// Raw Postgres errors are multi-line SQL dumps — keep the first line.
			const message =
				error instanceof Error ? error.message.split("\n")[0]?.trim() : null;
			toast.error(
				message ||
					t({
						message: "Failed to create automation",
					}),
			);
		},
	});

	const create = useCallback(
		async (draft: AutomationDraft) => {
			if (isPending) return false;
			let created = false;
			await runGatedFeature(GATED_FEATURES.AUTOMATIONS, async () => {
				created = await mutateAsync(draft).then(
					() => true,
					() => false,
				);
			});
			return created;
		},
		[isPending, mutateAsync, runGatedFeature],
	);

	return { create, isPending };
}
